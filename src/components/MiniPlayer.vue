<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { usePlayerStore } from '../store/playerStore'
import { useUiStore } from '../store/uiStore'
import { useSettingsStore } from '../store/settingsStore'
import { cyclePlayMode, isLiked, next, prev, seek, setVolume, toggle, toggleLike } from '../utils/player'
import { formatTime } from '../utils/format'
import api from '../utils/windowApi'
import Icon from './Icon.vue'
import PlayerProgress from './PlayerProgress.vue'

const player = usePlayerStore()
const ui = useUiStore()
const settings = useSettingsStore()
const router = useRouter()

const song = computed(() => player.currentSong)
const cover = computed(() => song.value?.al?.picUrl || song.value?.album?.picUrl || '')
const artistList = computed(() => song.value?.ar || song.value?.artists || [])
const artists = computed(() => artistList.value.map((a) => a.name).join(' / '))
// 每位歌手单独成链：A / B / C 分别跳各自的歌手页，而不是都跳第一个
const artistLinks = computed(() =>
  artistList.value.map((a) => ({
    name: a.name || '',
    id: a.id && !song.value?.local ? a.id : null
  }))
)
const hasArtistLink = computed(() => artistLinks.value.some((a) => a.id))
function goArtist(id) {
  if (id) router.push(`/artist/${id}`)
}

const MODE_ICONS = ['mode-sequential', 'mode-loop', 'mode-one', 'mode-shuffle']
const MODE_NAMES = ['顺序播放', '列表循环', '单曲循环', '随机播放']
const modeIcon = computed(() => MODE_ICONS[player.playMode])
const modeName = computed(() => MODE_NAMES[player.playMode])

function onVolume(event) {
  setVolume(Number(event.target.value))
}

function toggleMute() {
  setVolume(player.volume > 0 ? 0 : 0.7)
}

const desktopLyricOn = ref(false)
async function toggleDesktopLyric() {
  const visible = await api.toggleDesktopLyric()
  desktopLyricOn.value = !!visible
  ui.toast(visible ? '桌面歌词已开启' : '桌面歌词已隐藏')
}
</script>

<template>
  <footer class="player hb-acrylic">
    <PlayerProgress
      class="player__progress"
      thin
      :progress="player.progress"
      :duration="player.duration"
      :live="settings.seekLive"
      @seek="seek"
    />

    <div class="player__inner">
      <div class="player__song" :class="{ 'is-empty': !song }" @click="song && ui.toggleNowPlaying(true)">
        <div class="player__cover hb-frame">
          <Transition name="coverfade">
            <img v-if="cover" :key="cover" :src="`${cover}?param=96y96`" alt="" />
          </Transition>
          <div v-if="!cover" class="player__cover-empty">
            <Icon name="disc" :size="18" />
          </div>
        </div>
        <div class="player__info">
          <div class="player__title hb-clamp-1">{{ song ? song.name : '未在播放' }}</div>
          <div v-if="song && hasArtistLink" class="player__artist hb-clamp-1 artist-links">
            <template v-for="(a, i) in artistLinks" :key="a.id || `local-${i}`">
              <span v-if="i" class="artist-links__sep"> / </span>
              <button
                v-if="a.id"
                class="artist-links__btn"
                :title="`前往 ${a.name} 的主页`"
                @click.stop="goArtist(a.id)"
              >{{ a.name }}</button>
              <span v-else>{{ a.name }}</span>
            </template>
          </div>
          <div v-else class="player__artist hb-clamp-1">
            {{ song ? artists : '从首页或搜索结果里选一首开始' }}
          </div>
        </div>
      </div>

      <div class="player__controls">
        <button class="ctrl" title="上一首" :disabled="!song" @click="prev()">
          <Icon name="prev" :size="16" />
        </button>
        <button class="ctrl ctrl--main" :title="player.playing ? '暂停' : '播放'" :disabled="!song" @click="toggle()">
          <Icon :name="player.playing ? 'pause' : 'play'" :size="16" />
        </button>
        <button class="ctrl" title="下一首" :disabled="!song" @click="next()">
          <Icon name="next" :size="16" />
        </button>
        <button class="ctrl" :title="modeName" @click="cyclePlayMode()">
          <Icon :name="modeIcon" :size="15" />
        </button>
      </div>

      <div class="player__meta">
        <span class="player__time hb-mono">
          {{ formatTime(player.progress) }} / {{ formatTime(player.duration) }}
        </span>

        <div class="volume">
          <button class="ctrl ctrl--small" :title="player.volume ? '静音' : '取消静音'" @click="toggleMute">
            <Icon :name="player.volume ? 'volume' : 'mute'" :size="15" />
          </button>
          <input
            class="volume__range"
            type="range"
            min="0"
            max="1"
            step="0.01"
            :value="player.volume"
            @input="onVolume"
          />
        </div>

        <button
          class="ctrl ctrl--small"
          :class="{ 'is-active': isLiked(song) }"
          title="喜欢"
          :disabled="!song"
          @click="toggleLike(song)"
        >
          <Icon name="heart" :size="15" />
        </button>

        <button
          class="ctrl ctrl--small"
          title="添加到歌单"
          :disabled="!song"
          @click="ui.openAddToPlaylist(song)"
        >
          <Icon name="playlist-add" :size="16" />
        </button>

        <button class="ctrl ctrl--small" title="播放队列" @click="ui.toggleQueue()">
          <Icon name="queue" :size="16" />
        </button>

        <button
          class="ctrl ctrl--small"
          :class="{ 'is-active': desktopLyricOn }"
          title="桌面歌词"
          @click="toggleDesktopLyric"
        >
          <Icon name="lyrics" :size="16" />
        </button>

        <button class="ctrl ctrl--small player__expand" title="展开播放页" :disabled="!song" @click="ui.toggleNowPlaying(true)">
          <Icon name="chevron-left" :size="14" />
        </button>
      </div>
    </div>
  </footer>
</template>

<style scoped lang="scss">
.player {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  height: var(--player);
  background: var(--player-bg);
  border-top: 1px solid var(--line-strong);
  box-shadow: inset 0 -1px 0 var(--glass-edge);
  z-index: 50;

  &__progress {
    position: absolute;
    top: -1px;
    left: 0;
    right: 0;
    z-index: 2;
  }

  &__inner {
    height: 100%;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    gap: 20px;
    padding: 0 var(--gutter);
  }

  &__song {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
    cursor: pointer;

    &.is-empty {
      cursor: default;
      opacity: 0.6;
    }
  }

  &__cover {
    width: 44px;
    height: 44px;
    flex: none;
    border: 1px solid var(--line);
    background: var(--paper-deep);

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    &-empty {
      width: 100%;
      height: 100%;
      display: grid;
      place-items: center;
      color: var(--faint);
    }
  }

  &__info {
    min-width: 0;
  }

  &__title {
    font-size: 13px;
    color: var(--ink);
  }

  &__artist {
    font-size: 11px;
    color: var(--muted);
    margin-top: 2px;
  }

  &__controls {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  &__meta {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
  }

  &__time {
    font-size: 9px;
    color: var(--muted);
    letter-spacing: 0.1em;
    margin-right: 4px;
  }

  &__expand :deep(.hb-icon) {
    transform: rotate(90deg);
  }
}

.ctrl {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  color: var(--ink-soft);
  transition: color 0.14s, background 0.14s, transform 0.14s;

  &:hover:not(:disabled) {
    color: var(--ink);
    background: var(--hover);
  }

  &:disabled {
    opacity: 0.35;
    cursor: default;
  }

  &.is-active {
    color: var(--accent);
  }

  &--main {
    width: 34px;
    height: 34px;
    margin: 0 8px;
    border-radius: 50%;
    background: var(--accent);
    color: var(--on-accent);

    &:hover:not(:disabled) {
      background: var(--accent-dark);
      color: var(--on-accent);
    }
  }

  &--small {
    width: 28px;
    height: 28px;
  }
}

.volume {
  display: flex;
  align-items: center;
  gap: 4px;

  &__range {
    -webkit-appearance: none;
    width: 82px;
    height: 12px;
    background: transparent;
    cursor: pointer;

    &::-webkit-slider-runnable-track {
      height: 1px;
      background: var(--line-strong);
    }

    &::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 4px;
      height: 12px;
      background: var(--ink);
      margin-top: -5.5px;
    }
  }
}
/* 多位歌手：每位单独可点，斜杠只是分隔符 */
.artist-links {
  max-width: 100%;
  white-space: nowrap;

  &__sep {
    color: var(--faint);
  }

  &__btn {
    display: inline;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
    transition: color 0.16s;

    &:hover {
      color: var(--ink);
      text-decoration: underline;
      text-underline-offset: 2px;
    }
  }
}

/* 换歌时底栏封面做同样的模糊交叉淡入，只是幅度更小 */
.player__cover {
  position: relative;
}

.player__cover img {
  position: absolute;
  inset: 0;
}

.coverfade-enter-active {
  transition: opacity 0.45s cubic-bezier(0.16, 1, 0.3, 1),
    filter 0.45s cubic-bezier(0.16, 1, 0.3, 1),
    transform 0.45s cubic-bezier(0.16, 1, 0.3, 1);
}

.coverfade-leave-active {
  transition: opacity 0.3s ease;
}

.coverfade-enter-from {
  opacity: 0;
  filter: blur(8px);
  transform: scale(1.08);
}

.coverfade-leave-to {
  opacity: 0;
  filter: blur(6px);
}
</style>
