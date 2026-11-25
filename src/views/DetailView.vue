<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useLibraryStore } from '../store/libraryStore'
import { useUserStore } from '../store/userStore'
import { useHomeStore } from '../store/homeStore'
import { playList } from '../utils/player'
import { downloadSongs } from '../utils/download'
import { formatCount, formatDate, dayOfMonth } from '../utils/format'
import { getArtistAlbum } from '../api/artist'
import { getLikelist } from '../api/user'
import { goBack } from '../utils/nav'
import { COMMENT_TYPE } from '../api/comment'
import SongTable from '../components/SongTable.vue'
import CoverCard from '../components/CoverCard.vue'
import CommentPanel from '../components/CommentPanel.vue'
import ShareButton from '../components/ShareButton.vue'
import PlaylistManager from '../components/PlaylistManager.vue'
import Icon from '../components/Icon.vue'

const props = defineProps({
  kind: { type: String, required: true },
  id: { type: [String, Number], default: null }
})

const route = useRoute()
const router = useRouter()
const library = useLibraryStore()
const home = useHomeStore()
const user = useUserStore()

const albums = ref([])
const albumLimit = 12
const albumOffset = ref(0)
const albumHasMore = ref(false)
const albumMoreLoading = ref(false)
const descExpanded = ref(false)
const dialog = ref('') // '' | 'edit' | 'add'

const KIND_LABEL = {
  playlist: 'PLAYLIST',
  album: 'ALBUM',
  artist: 'ARTIST',
  likes: 'MY FAVORITES',
  daily: 'DAILY MIX'
}

const songs = computed(() => (props.kind === 'daily' ? home.daily : library.songs))

const info = computed(() => {
  if (props.kind === 'daily') {
    return {
      name: '每日推荐',
      description: '根据你的听歌口味每天生成，6:00 更新。',
      trackCount: home.daily.length
    }
  }
  return library.info
})

const cover = computed(() => {
  if (props.kind === 'daily') return songs.value[0]?.al?.picUrl || ''
  if (props.kind === 'artist') return info.value?.picUrl || info.value?.img1v1Url || ''
  return info.value?.coverImgUrl || info.value?.picUrl || songs.value[0]?.al?.picUrl || ''
})

const isLoading = computed(() => (props.kind === 'daily' ? false : library.loading))
const isArtist = computed(() => props.kind === 'artist')

const shareType = computed(() => (['playlist', 'album', 'artist'].includes(props.kind) ? props.kind : ''))
const shareItem = computed(() => (shareType.value && info.value ? info.value : null))

// 评论资源：歌单 / 专辑 / 歌曲才有对应 threadId，歌手与虚拟列表（daily/likes）没有
const commentTarget = computed(() => {
  const map = { playlist: COMMENT_TYPE.PLAYLIST, album: COMMENT_TYPE.ALBUM }
  const type = map[props.kind]
  if (type === undefined || !props.id) return null
  return { type, id: props.id }
})
// 只有自己创建的歌单才能编辑 / 加歌
const canManage = computed(
  () => props.kind === 'playlist' && user.loggedIn && info.value?.creator?.userId === user.user?.userId
)

function onPlaylistSaved() {
  dialog.value = ''
  load()
}

const subtitle = computed(() => {
  const meta = info.value
  if (!meta) return ''
  if (props.kind === 'artist') {
    const fans = meta.fansCount ? `${formatCount(meta.fansCount)} 粉丝` : ''
    return [meta.alias?.join(' / '), fans].filter(Boolean).join(' · ')
  }
  const parts = []
  if (meta.creator?.nickname) parts.push(meta.creator.nickname)
  if (props.kind === 'album' && meta.artist?.name) parts.push(meta.artist.name)
  if (meta.publishTime) parts.push(formatDate(new Date(meta.publishTime)))
  parts.push(`${meta.trackCount ?? songs.value.length} 首`)
  return parts.filter(Boolean).join(' · ')
})

const description = computed(() => info.value?.description || info.value?.briefDesc || '')

/** 歌手专辑分页：reset 从 0 开始，否则按 offset 追加 */
async function loadAlbums(reset = false) {
  if (albumMoreLoading.value) return
  if (reset) {
    albumOffset.value = 0
    albumHasMore.value = false
    albums.value = []
  }
  albumMoreLoading.value = true
  try {
    const res = await getArtistAlbum({ id: props.id, limit: albumLimit, offset: albumOffset.value })
    const list = res?.hotAlbums || []
    albums.value = reset ? list : albums.value.concat(list)
    albumOffset.value += list.length
    // 后端 hasMore 有时缺失，用「返回满页」兜底判断，避免下一页为空时按钮消失过早
    albumHasMore.value = typeof res?.hasMore === 'boolean'
      ? res.hasMore && list.length > 0
      : list.length >= albumLimit
  } catch (err) {
    if (reset) albums.value = []
    albumHasMore.value = false
  } finally {
    albumMoreLoading.value = false
  }
}

async function load() {
  descExpanded.value = false
  albumOffset.value = 0
  albumHasMore.value = false
  albums.value = []
  if (props.kind === 'playlist') await library.loadPlaylist(props.id)
  else if (props.kind === 'album') await library.loadAlbum(props.id)
  else if (props.kind === 'artist') {
    await library.loadArtist(props.id)
    await loadAlbums(true)
  } else if (props.kind === 'likes') {
    if (!user.loggedIn) return router.replace('/login')
    if (!user.likelist.length && user.user?.userId) {
      try {
        const likes = await getLikelist(user.user.userId)
        user.setLikelist(likes.ids || [])
      } catch (err) {
        // 拿不到就按空列表处理
      }
    }
    await library.loadLikes(user.likelist)
  } else if (props.kind === 'daily') {
    if (!user.loggedIn) return router.replace('/login')
    if (!home.daily.length) await home.loadDaily()
  }
}

function playAll() {
  if (!songs.value.length) return
  const playable = songs.value.filter((song) => song.playable !== false)
  if (!playable.length) {
    library.error = '这个列表里的歌曲暂时都不可播放'
    return
  }
  playList(playable, 0, { kind: props.kind, name: info.value?.name })
}

function shufflePlay() {
  if (!songs.value.length) return
  const playable = songs.value.filter((song) => song.playable !== false)
  if (!playable.length) return
  const index = Math.floor(Math.random() * playable.length)
  playList(playable, index, { kind: props.kind, name: info.value?.name })
}

function downloadAll() {
  if (!songs.value.length) return
  downloadSongs(songs.value)
}

watch(() => [props.kind, props.id], load, { immediate: true })
</script>

<template>
  <div class="detail hb-page">
    <div class="detail__top">
      <button class="back" @click="goBack(router)">
        <Icon name="chevron-left" :size="12" />
        <span class="hb-mono">返回</span>
      </button>
    </div>

    <div v-if="isLoading" class="detail__skeleton">
      <div class="sk-cover" />
      <div class="sk-lines">
        <div class="sk-line" style="width: 30%" />
        <div class="sk-line" style="width: 60%; height: 34px" />
        <div class="sk-line" style="width: 40%" />
      </div>
    </div>

    <template v-else-if="info">
      <header class="head">
        <div class="head__cover hb-frame hb-dots" :class="{ 'head__cover--round': isArtist }">
          <img v-if="cover" :src="`${cover}?param=500y500`" alt="" />
          <div v-else class="head__cover-empty">
            <span v-if="kind === 'daily'" class="head__date hb-mono">{{ dayOfMonth() }}</span>
            <Icon v-else name="music" :size="42" />
          </div>
        </div>

        <div class="head__meta">
          <span class="hb-label">{{ KIND_LABEL[kind] }}</span>
          <h1 class="head__title hb-display">{{ info.name }}</h1>
          <div class="head__sub hb-mono">{{ subtitle }}</div>

          <p
            v-if="description"
            class="head__desc"
            :class="{ 'is-collapsed': !descExpanded }"
            @click="descExpanded = !descExpanded"
          >
            {{ description }}
          </p>

          <div class="head__actions">
            <button class="hb-btn hb-btn--solid" :disabled="!songs.length" @click="playAll">
              <Icon name="play" :size="11" />
              播放全部
            </button>
            <button class="hb-btn" :disabled="!songs.length" @click="shufflePlay">
              <Icon name="mode-shuffle" :size="12" />
              随机播放
            </button>
            <button class="hb-btn" :disabled="!songs.length" title="把整个列表加入下载队列" @click="downloadAll">
              <Icon name="download" :size="12" />
              下载全部
            </button>
            <ShareButton v-if="shareItem" :type="shareType" :item="shareItem" />
            <button v-if="canManage" class="hb-btn" @click="dialog = 'edit'">
              <Icon name="more" :size="12" />
              编辑
            </button>
            <button v-if="canManage" class="hb-btn" @click="dialog = 'add'">
              <Icon name="plus" :size="12" />
              添加歌曲
            </button>
            <span v-if="kind === 'playlist' && info.playCount" class="head__count hb-mono">
              {{ formatCount(info.playCount) }} 次播放
            </span>
          </div>
        </div>
      </header>

      <section class="tracks">
        <div class="hb-section">
          <span class="hb-label">01</span>
          <h2 class="hb-section__title">{{ isArtist ? '热门作品' : '歌曲列表' }}</h2>
          <span class="hb-section__line" />
          <span class="hb-mono hb-muted">{{ songs.length }} TRACKS</span>
        </div>

        <SongTable v-if="songs.length" :songs="songs" :show-album="kind !== 'album'" :context="{ kind, name: info?.name }" />
        <p v-else class="empty">这里还没有歌曲</p>
      </section>

      <section v-if="isArtist && albums.length" class="albums">
        <div class="hb-section">
          <span class="hb-label">02</span>
          <h2 class="hb-section__title">专辑</h2>
          <span class="hb-section__line" />
        </div>
        <div class="grid">
          <CoverCard v-for="(item, index) in albums" :key="item.id" :index="index" :item="item" kind="album" :subtitle="item.publishTime ? formatDate(new Date(item.publishTime)) : ''" />
        </div>
        <div v-if="albumHasMore || albumMoreLoading" class="albums__more">
          <button class="hb-btn" :disabled="albumMoreLoading" @click="loadAlbums(false)">
            <Icon name="more" :size="12" />
            {{ albumMoreLoading ? '加载中…' : '加载更多专辑' }}
          </button>
          <span class="hb-mono hb-muted">{{ albums.length }} LOADED</span>
        </div>
      </section>

      <section v-if="commentTarget" class="detail-comments">
        <CommentPanel :type="commentTarget.type" :id="commentTarget.id" />
      </section>

      <p v-if="library.error" class="empty">{{ library.error }}</p>
    </template>

    <p v-else-if="library.error" class="empty">{{ library.error }}</p>

    <Transition name="dlg">
      <PlaylistManager
        v-if="dialog"
        :mode="dialog"
        :playlist="library.info"
        @close="dialog = ''"
        @saved="onPlaylistSaved"
      />
    </Transition>
  </div>
</template>

<style scoped lang="scss">
.detail {
}

.detail__top {
  margin-bottom: 14px;
}

.back {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: var(--muted);
  transition: color 0.16s;

  &:hover {
    color: var(--ink);
  }
}

.head {
  display: grid;
  grid-template-columns: 232px minmax(0, 1fr);
  gap: 40px;
  margin-bottom: 42px;

  &__cover {
    width: 232px;
    height: 232px;
    background: var(--surface);
    border: 1px solid var(--line);

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    &--round {
      border-radius: 50%;
      overflow: hidden;
    }

    &-empty {
      width: 100%;
      height: 100%;
      display: grid;
      place-items: center;
      background: var(--surface);
      color: var(--ink);
    }
  }

  &__date {
    font-size: 64px;
    letter-spacing: -0.02em;
    line-height: 1;
  }

  &__meta {
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
    padding-top: 4px;
  }

  &__title {
    font-size: 34px;
    line-height: 1.15;
    max-width: 100%;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  &__sub {
    font-size: 9px;
    color: var(--muted);
    letter-spacing: 0.12em;
  }

  &__desc {
    max-width: 720px;
    font-size: 11.5px;
    line-height: 1.7;
    color: var(--ink-soft);
    cursor: pointer;

    &.is-collapsed {
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
  }

  &__actions {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 6px;
  }

  &__count {
    font-size: 9px;
    color: var(--faint);
    margin-left: 6px;
  }
}

.tracks {
  margin-bottom: 36px;
}

.albums .grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 26px 20px;
}

.albums__more {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 26px;
  padding-top: 16px;
  border-top: 1px solid var(--line-soft);

  .hb-mono {
    font-size: 9px;
    letter-spacing: 0.1em;
  }
}

.detail-comments {
  margin-top: 36px;
  padding-top: 4px;
}

.empty {
  padding: 46px 0;
  text-align: center;
  color: var(--muted);
  font-size: 12px;
}

/* 骨架 */
.detail__skeleton {
  display: grid;
  grid-template-columns: 232px minmax(0, 1fr);
  gap: 40px;
}

.sk-cover {
  width: 232px;
  height: 232px;
  background: var(--hover-surface);
  animation: pulse 1.4s infinite ease-in-out;
}

.sk-lines {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding-top: 10px;
}

.sk-line {
  height: 14px;
  background: var(--hover-surface);
  animation: pulse 1.4s infinite ease-in-out;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 0.5;
  }
  50% {
    opacity: 1;
  }
}
</style>
