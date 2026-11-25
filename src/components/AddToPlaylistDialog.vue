<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { getUserPlaylist } from '../api/user'
import { createPlaylist, updatePlaylist } from '../api/playlist'
import { useUserStore } from '../store/userStore'
import { useUiStore } from '../store/uiStore'
import Icon from './Icon.vue'

const props = defineProps({
  song: { type: Object, required: true }
})
const emit = defineEmits(['close'])

const router = useRouter()
const user = useUserStore()
const ui = useUiStore()

const playlists = ref([])
const loading = ref(false)
const busyId = ref(0)
const creating = ref(false)
const error = ref('')
const newName = ref('')

const artists = computed(() =>
  (props.song.ar || props.song.artists || []).map((a) => a.name).join(' / ')
)

async function load() {
  if (!user.loggedIn) return
  loading.value = true
  error.value = ''
  try {
    const res = await getUserPlaylist({ uid: user.user.userId, limit: 1000 })
    const all = res?.playlist || []
    // 只能往自己创建的歌单里加歌；specialType 5 是「我喜欢的音乐」，走另一套接口，排除
    playlists.value = all.filter(
      (p) => p.creator?.userId === user.user.userId && p.specialType !== 5
    )
  } catch (err) {
    error.value = '歌单加载失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

onMounted(load)

function close() {
  emit('close')
}

async function addTo(pl) {
  if (busyId.value || creating.value) return
  busyId.value = pl.id
  error.value = ''
  try {
    const res = await updatePlaylist({ op: 'add', pid: pl.id, tracks: props.song.id })
    if (res?.code && res.code !== 200) throw new Error(res?.message || res?.msg || '添加失败')
    ui.toast(`已添加到「${pl.name}」`)
    close()
  } catch (err) {
    error.value = err?.response?.data?.message || err?.message || '添加失败，请确认已登录且是自己的歌单'
  } finally {
    busyId.value = 0
  }
}

async function createAndAdd() {
  const name = newName.value.trim()
  if (!name) return (error.value = '请填写新歌单名称')
  if (creating.value || busyId.value) return
  creating.value = true
  error.value = ''
  try {
    const res = await createPlaylist({ name })
    const pid = res?.playlist?.id || res?.id || res?.data?.id
    if (!pid) throw new Error('创建失败，请确认已登录')
    const added = await updatePlaylist({ op: 'add', pid, tracks: props.song.id })
    if (added?.code && added.code !== 200) throw new Error(added?.message || added?.msg || '添加失败')
    ui.toast(`已新建「${name}」并添加`)
    close()
  } catch (err) {
    error.value = err?.response?.data?.message || err?.message || '创建失败，请确认已登录'
  } finally {
    creating.value = false
  }
}

function goLogin() {
  close()
  router.push('/login')
}
</script>

<template>
  <div class="ap-overlay" @mousedown.self="close">
    <div class="ap hb-acrylic" role="dialog">
      <header class="ap__head">
        <div>
          <span class="hb-label">PLAYLIST / ADD TRACK</span>
          <h2 class="ap__title hb-display">添加到歌单</h2>
        </div>
        <button class="hb-icon-btn" title="关闭" @click="close"><Icon name="close" :size="16" /></button>
      </header>

      <div class="ap__song">
        <span class="ap__song-icon"><Icon name="music" :size="15" /></span>
        <span class="ap__song-main">
          <span class="ap__song-name hb-clamp-1">{{ song.name }}</span>
          <span class="ap__song-artist hb-clamp-1">{{ artists || '—' }}</span>
        </span>
        <span class="ap__song-id hb-mono">ID {{ song.id }}</span>
      </div>

      <template v-if="!user.loggedIn">
        <div class="ap__blank">
          <Icon name="user" :size="24" />
          <p>登录后才能把歌曲添加到自己的歌单</p>
          <button class="hb-btn hb-btn--solid" @click="goLogin">去登录</button>
        </div>
      </template>

      <template v-else>
        <div class="ap__cap hb-mono">MY PLAYLISTS / 我创建的歌单</div>
        <div class="ap__list hb-scroll">
          <button
            v-for="pl in playlists"
            :key="pl.id"
            class="ap__row"
            :disabled="!!busyId || creating"
            @click="addTo(pl)"
          >
            <span class="ap__cover">
              <img v-if="pl.coverImgUrl" :src="`${pl.coverImgUrl}?param=80y80`" alt="" />
              <Icon v-else name="album" :size="15" />
            </span>
            <span class="ap__row-main">
              <span class="ap__row-name hb-clamp-1">{{ pl.name }}</span>
              <span class="ap__row-sub hb-mono">{{ pl.trackCount ?? 0 }} TRACKS</span>
            </span>
            <span class="ap__row-add">
              <Icon :name="busyId === pl.id ? 'more' : 'plus'" :size="13" />
            </span>
          </button>

          <p v-if="loading" class="ap__hint hb-mono">LOADING…</p>
          <p v-else-if="!playlists.length" class="ap__hint hb-mono">还没有创建过歌单，可在下方直接新建一个</p>
        </div>

        <div class="ap__create">
          <input
            v-model="newName"
            class="ap__input"
            maxlength="40"
            placeholder="新建歌单并添加这首歌"
            :disabled="creating || !!busyId"
            @keyup.enter="createAndAdd"
          />
          <button class="hb-btn" :disabled="creating || !!busyId" @click="createAndAdd">
            <Icon name="plus" :size="12" />
            {{ creating ? '处理中…' : '新建并添加' }}
          </button>
        </div>
      </template>

      <p v-if="error" class="ap__error hb-mono">{{ error }}</p>

      <footer class="ap__foot">
        <span class="hb-mono hb-muted">选择歌单即可添加</span>
        <button class="hb-btn" @click="close">取消</button>
      </footer>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ap-overlay {
  position: fixed;
  inset: 0;
  z-index: 130;
  display: grid;
  place-items: center;
  background: rgba(12, 12, 9, 0.46);
  -webkit-app-region: no-drag;
}

.ap {
  width: min(440px, calc(100vw - 80px));
  max-height: calc(100vh - 120px);
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px 22px 16px;
  background: var(--panel-bg);
  border: 1px solid var(--line-strong);
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.32);

  &__head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--line);
  }

  &__title {
    font-size: 22px;
    margin-top: 5px;
  }

  &__song {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 11px;
    background: var(--field-bg);
    border-left: 2px solid var(--accent);
  }

  &__song-icon {
    display: grid;
    place-items: center;
    color: var(--accent);
  }

  &__song-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  &__song-name {
    font-size: 12px;
    color: var(--ink);
  }

  &__song-artist {
    font-size: 10px;
    color: var(--muted);
  }

  &__song-id {
    flex: none;
    font-size: 8px;
    color: var(--faint);
  }

  &__cap {
    font-size: 8px;
    letter-spacing: 0.14em;
    color: var(--faint);
  }

  &__list {
    min-height: 90px;
    max-height: 260px;
    overflow-y: auto;
    border: 1px solid var(--line);
  }

  &__row {
    width: 100%;
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr) 24px;
    align-items: center;
    gap: 10px;
    padding: 7px 10px;
    border: none;
    border-bottom: 1px solid var(--line-soft);
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: background 0.14s;

    &:last-child {
      border-bottom: none;
    }

    &:hover:not(:disabled) {
      background: var(--hover);
    }

    &:disabled {
      opacity: 0.55;
      cursor: default;
    }
  }

  &__cover {
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    overflow: hidden;
    border: 1px solid var(--line);
    background: var(--surface);
    color: var(--faint);

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  }

  &__row-main {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  &__row-name {
    font-size: 12px;
    color: var(--ink);
  }

  &__row-sub {
    font-size: 8px;
    color: var(--muted);
  }

  &__row-add {
    display: grid;
    place-items: center;
    color: var(--faint);

    .ap__row:hover & {
      color: var(--accent);
    }
  }

  &__hint {
    padding: 22px 12px;
    font-size: 9px;
    letter-spacing: 0.1em;
    color: var(--faint);
    text-align: center;
  }

  &__blank {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 26px 12px;
    color: var(--faint);

    p {
      font-size: 12px;
      color: var(--muted);
    }
  }

  &__create {
    display: flex;
    gap: 8px;
  }

  &__input {
    flex: 1;
    min-width: 0;
    height: 32px;
    padding: 0 10px;
    border: 1px solid var(--line-strong);
    background: var(--field-bg);
    color: var(--ink);
    font: inherit;
    font-size: 12px;
    outline: none;

    &:focus {
      border-color: var(--ink);
    }

    &::placeholder {
      color: var(--faint);
    }
  }

  &__error {
    font-size: 10px;
    line-height: 1.5;
    color: var(--danger);
    padding-left: 8px;
    border-left: 2px solid var(--danger);
  }

  &__foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding-top: 12px;
    border-top: 1px solid var(--line);

    .hb-mono {
      font-size: 8px;
    }
  }
}
</style>
