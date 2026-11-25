<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { usePlayerStore } from '../store/playerStore'
import { playAt, playList, addToNext, toggleLike, isLiked, toggle } from '../utils/player'
import { formatTime } from '../utils/format'
import { downloadSong } from '../utils/download'
import { copyShare } from '../utils/share'
import api from '../utils/windowApi'
import { useUiStore } from '../store/uiStore'
import Icon from './Icon.vue'

const props = defineProps({
  songs: { type: Array, default: () => [] },
  showAlbum: { type: Boolean, default: true },
  context: { type: Object, default: null }
})

const router = useRouter()
const player = usePlayerStore()
const ui = useUiStore()

const isCurrent = (song) => player.songId === song.id

function play(index) {
  const song = props.songs[index]
  if (song?.playable === false) {
    ui.toast(song.reason || '该歌曲暂不可播放')
    return
  }
  // 队列还不是当前列表时，先用列表建队列（否则 playAt 会因为没有队列而静默返回）
  if (player.songList !== props.songs) {
    playList(props.songs, index, props.context)
    return
  }
  if (player.songId === song.id) {
    toggle()
    return
  }
  playAt(index)
}

function onRowClick(index) {
  play(index)
}

function onLike(song) {
  toggleLike(song)
}

function toAlbum(song) {
  if (song.al?.id) router.push(`/album/${song.al.id}`)
}

function shareSong(song) {
  copyShare('song', song)
}

function addToPlaylist(song) {
  ui.openAddToPlaylist(song)
}

function reveal(song) {
  if (song?.path) api.revealFile(song.path)
}

const count = computed(() => props.songs.length)
</script>

<template>
  <div class="tracks">
    <div class="tracks__head">
      <span class="tracks__col tracks__col--idx hb-mono">No.</span>
      <span class="tracks__col tracks__col--title hb-mono">标题</span>
      <span v-if="showAlbum" class="tracks__col tracks__col--album hb-mono">专辑</span>
      <span class="tracks__col tracks__col--time hb-mono">时长</span>
      <span class="tracks__col tracks__col--act" />
    </div>

    <div
      v-for="(song, index) in songs"
      :key="`${song.id}-${index}`"
      class="track"
      :class="{ 'is-current': isCurrent(song), 'is-locked': song.playable === false }"
      @click="onRowClick(index)"
    >
      <span class="track__idx">
        <span class="track__num hb-mono">{{ String(index + 1).padStart(2, '0') }}</span>
        <button class="track__play" title="播放" @click="play(index)">
          <Icon name="play" :size="13" />
        </button>
      </span>

      <div class="track__main">
        <div class="track__title hb-clamp-1">
          {{ song.name }}
          <span v-if="song.playable === false" class="track__tag">{{ song.reason || '不可播放' }}</span>
        </div>
        <div class="track__artist hb-clamp-1">
          <template v-for="(ar, i) in song.ar || []" :key="ar.id">
            <RouterLink class="track__link" :to="`/artist/${ar.id}`" @click.stop>{{ ar.name }}</RouterLink>
            <span v-if="i < (song.ar.length - 1)" class="track__sep">/</span>
          </template>
        </div>
      </div>

      <button v-if="showAlbum" class="track__album hb-clamp-1" @click.stop="toAlbum(song)">
        {{ song.al?.name || '—' }}
      </button>
      <span v-else />

      <span class="track__time hb-mono">{{ song.local ? (song.ext || '—').toUpperCase() : formatTime((song.dt || 0) / 1000) }}</span>

      <div class="track__act">
        <template v-if="song.local">
          <button class="hb-icon-btn track__act-btn" title="下一首播放" @click.stop="addToNext(song)">
            <Icon name="queue" :size="15" />
          </button>
          <button class="hb-icon-btn track__act-btn" title="定位文件" @click.stop="reveal(song)">
            <Icon name="folder" :size="15" />
          </button>
        </template>
        <template v-else>
          <button
            class="hb-icon-btn track__act-btn"
            :class="{ 'is-active': isLiked(song) }"
            title="喜欢"
            @click.stop="onLike(song)"
          >
            <Icon name="heart" :size="15" />
          </button>
          <button class="hb-icon-btn track__act-btn" title="下一首播放" @click.stop="addToNext(song)">
            <Icon name="queue" :size="15" />
          </button>
          <button class="hb-icon-btn track__act-btn" title="下载" @click.stop="downloadSong(song)">
            <Icon name="download" :size="15" />
          </button>
          <button class="hb-icon-btn track__act-btn" title="分享（复制链接）" @click.stop="shareSong(song)">
            <Icon name="share" :size="15" />
          </button>
          <button class="hb-icon-btn track__act-btn" title="添加到歌单" @click.stop="addToPlaylist(song)">
            <Icon name="playlist-add" :size="15" />
          </button>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.tracks {
  width: 100%;
}

.tracks__head,
.track {
  display: grid;
  grid-template-columns: 46px minmax(0, 2.4fr) minmax(0, 1.4fr) 62px 132px;
  align-items: center;
  gap: 12px;
}

.tracks__head {
  padding: 0 8px 8px;
  border-bottom: 1px solid var(--line);
  color: var(--faint);

  .hb-mono {
    font-size: 9px;
  }

  .tracks__col--time {
    text-align: right;
  }
}

.track {
  position: relative;
  padding: 7px 8px;
  border-bottom: 1px solid var(--line-soft);
  transition: background 0.14s;
  cursor: pointer;

  &:hover {
    background: var(--hover-surface);
  }

  &.is-current {
    /* 曾经是实心白块，压在背景图上太抢眼；改成纸色玻璃条 */
    background: var(--row-current);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);

    &::before {
      content: '';
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 2px;
      background: var(--ink);
    }

    .track__num {
      color: var(--ink);
    }
  }

  &.is-locked {
    .track__title {
      color: var(--muted);
    }

    .track__num {
      color: var(--faint);
    }
  }

  &__idx {
    position: relative;
    display: grid;
    place-items: center;
    width: 36px;
  }

  &__num {
    font-size: 10px;
    color: var(--faint);
  }

  &__play {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    background: transparent;
    color: var(--ink);
    opacity: 0;
    transition: opacity 0.15s;
  }

  &:hover &__play {
    opacity: 1;
  }

  &:hover &__num {
    opacity: 0;
  }

  &__main {
    min-width: 0;
  }

  &__title {
    font-size: 13px;
    color: var(--ink);
    letter-spacing: 0.01em;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  &__tag {
    font-family: var(--font-mono), monospace;
    font-size: 9px;
    letter-spacing: 0.02em;
    padding: 1px 6px 0;
    border: 1px solid var(--line);
    color: var(--ink-soft);
    flex: none;
  }

  &__artist {
    font-weight: 400;
    font-size: 11px;
    color: var(--muted);
    margin-top: 1px;
  }

  &__link:hover {
    color: var(--ink);
    text-decoration: underline;
  }

  &__sep {
    margin: 0 4px;
    color: var(--faint);
  }

  &__album {
    font-size: 11px;
    color: var(--muted);
    text-align: left;
    overflow: hidden;

    &:hover {
      color: var(--ink);
    }
  }

  &__time {
    font-size: 10px;
    color: var(--muted);
    text-align: right;
  }

  &__act {
    display: flex;
    gap: 2px;
    justify-content: flex-end;
    opacity: 0;
    transition: opacity 0.15s;
  }

  &:hover &__act {
    opacity: 1;
  }

  &__act-btn {
    width: 24px;
    height: 24px;
  }
}
</style>
