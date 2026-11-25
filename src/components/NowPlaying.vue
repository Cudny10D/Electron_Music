<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { usePlayerStore } from '../store/playerStore'
import { useUiStore } from '../store/uiStore'
import { useSettingsStore } from '../store/settingsStore'
import { cyclePlayMode, isLiked, next, prev, seek, setVolume, toggle, toggleLike } from '../utils/player'
import { formatTime } from '../utils/format'
import { findLyricIndex, isCreditLine } from '../utils/lyric'
import { downloadSong } from '../utils/download'
import { COMMENT_TYPE } from '../api/comment'
import Icon from './Icon.vue'
import PlayerProgress from './PlayerProgress.vue'
import CommentPanel from './CommentPanel.vue'

const player = usePlayerStore()
const ui = useUiStore()
const settings = useSettingsStore()
const router = useRouter()

const lyricRef = ref(null)
// 右栏视图：歌词 / 评论
const rightView = ref('lyric')

const song = computed(() => player.currentSong)
// 只有在线歌曲（网易云 id）才有评论；本地歌曲没有 threadId
const commentTarget = computed(() => {
  const id = song.value?.id
  if (!id || song.value?.local) return null
  return { type: COMMENT_TYPE.SONG, id }
})
const cover = computed(() => song.value?.al?.picUrl || '')
const artistList = computed(() => song.value?.ar || [])
const artists = computed(() => artistList.value.map((a) => a.name).join(' / '))
// A / B / C 各自带自己的 id：点击哪一位就跳哪一位，而不是统一跳第一个
const artistLinks = computed(() =>
  artistList.value.map((a) => ({
    name: a.name || '',
    id: a.id && !song.value?.local ? a.id : null
  }))
)
const hasArtistLink = computed(() => artistLinks.value.some((a) => a.id))
function goArtist(id) {
  if (!id) return
  ui.toggleNowPlaying(false)
  router.push(`/artist/${id}`)
}
// 制作人员信息（作词/作曲/编曲…）可在设置里隐藏
const lines = computed(() =>
  settings.hideCredits
    ? player.lyricLines.filter((line) => !isCreditLine(line.text))
    : player.lyricLines
)

// 过滤后索引会变，用时间反算当前行
const activeIndex = computed(() => findLyricIndex(lines.value, player.progress))

const MODE_ICONS = ['mode-sequential', 'mode-loop', 'mode-one', 'mode-shuffle']
const MODE_NAMES = ['顺序播放', '列表循环', '单曲循环', '随机播放']

function toggleOption(key) {
  settings.update({ [key]: !settings[key] })
}

// T：在评论页时切回歌词；在歌词页时切换歌词显示
function toggleLyric() {
  if (rightView.value === 'comment') {
    showLyricView()
    return
  }
  toggleOption('showLyric')
}

// 评论气泡：再点一次回到歌词
function toggleComment() {
  if (!commentTarget.value) return
  rightView.value = rightView.value === 'comment' ? 'lyric' : 'comment'
}

// 切回歌词视图；若用户此前关掉了歌词显示，顺带打开
function showLyricView() {
  rightView.value = 'lyric'
  if (!settings.showLyric) settings.update({ showLyric: true })
}

let lyricRaf = 0

function stopLyricScroll() {
  if (lyricRaf) cancelAnimationFrame(lyricRaf)
  lyricRaf = 0
}

// 自己用 rAF 滚，不用 behavior:'smooth'：
// 原生平滑滚动在每行重新触发时会打断自己，看起来一顿一顿的。
// 曲线是三次缓出（起步快、收尾轻），时长随距离增长，最多 680ms。
function scrollLyricTo(box, target) {
  stopLyricScroll()
  const from = box.scrollTop
  const delta = target - from
  if (Math.abs(delta) < 0.5) return

  const duration = Math.min(680, 260 + Math.abs(delta) * 1.1)
  const start = performance.now()
  const ease = (t) => 1 - Math.pow(1 - t, 3)

  const step = (now) => {
    const t = Math.min(1, (now - start) / duration)
    box.scrollTop = from + delta * ease(t)
    lyricRaf = t < 1 ? requestAnimationFrame(step) : 0
  }
  lyricRaf = requestAnimationFrame(step)
}

async function centerActive(index, smooth = true) {
  await nextTick()
  const box = lyricRef.value
  if (!box || index < 0) return
  const line = box.querySelectorAll('.line')[index]
  if (!line) return
  const target = Math.max(0, line.offsetTop - box.clientHeight / 2 + line.clientHeight / 2)
  if (!smooth) {
    stopLyricScroll()
    box.scrollTop = target
    return
  }
  scrollLyricTo(box, target)
}

// 切换当前行就居中；过滤制作人员后行数变化，也要重新定位
watch([activeIndex, () => lines.value.length], ([index]) => centerActive(index))

onMounted(() => {
  // 中途打开播放页时，先把当前行摆到中间，不要从第一行开始
  if (activeIndex.value >= 0) centerActive(activeIndex.value, false)
  window.addEventListener('resize', onResize)
  // 用户自己滚歌词时立刻让出控制权
  lyricRef.value?.addEventListener('wheel', stopLyricScroll, { passive: true })
  lyricRef.value?.addEventListener('touchstart', stopLyricScroll, { passive: true })
})

onBeforeUnmount(() => {
  clearTimeout(changeTimer)
  window.removeEventListener('resize', onResize)
  lyricRef.value?.removeEventListener('wheel', stopLyricScroll)
  lyricRef.value?.removeEventListener('touchstart', stopLyricScroll)
  stopLyricScroll()
})

let resizeTimer = null
function onResize() {
  clearTimeout(resizeTimer)
  resizeTimer = setTimeout(() => centerActive(activeIndex.value, false), 160)
}

// 切歌时整块内容做一次「模糊淡出 → 收敛」过渡，和封面/背景的交叉淡入同步
const songChanging = ref(false)
let changeTimer = null
watch(
  () => song.value?.id,
  () => {
    player.lyricIndex = -1
    if (lyricRef.value) lyricRef.value.scrollTop = 0
    if (rightView.value === 'comment' && !commentTarget.value) rightView.value = 'lyric'
    songChanging.value = false
    clearTimeout(changeTimer)
    requestAnimationFrame(() => {
      songChanging.value = true
      changeTimer = setTimeout(() => (songChanging.value = false), 620)
    })
  }
)

function onVolume(event) {
  setVolume(Number(event.target.value))
}
</script>

<template>
  <section class="np">
    <Transition name="npbg">
      <div
        :key="cover"
        class="np__bg"
        :style="cover ? { backgroundImage: `url(${cover}?param=600y600)` } : null"
      />
    </Transition>
    <div class="np__veil" />

    <header class="np__top">
      <button class="np__exit" title="退出全屏 (Esc)" @click="ui.toggleNowPlaying(false)">
        <Icon name="chevron-left" :size="14" />
        <span class="hb-mono">退出</span>
      </button>

      <span class="hb-label np__badge">NOW PLAYING</span>
    </header>

    <div
      class="np__body"
      :class="{
        'np__body--single': rightView === 'lyric' && !settings.showLyric,
        'np__body--changing': songChanging
      }"
    >
      <div class="np__left">
        <div class="np__cover hb-frame hb-dots">
          <Transition name="coverfade">
            <img v-if="cover" :key="cover" :src="`${cover}?param=600y600`" alt="" />
          </Transition>
          <div v-if="!cover" class="np__cover-empty"><Icon name="disc" :size="48" /></div>
        </div>

        <h1 class="np__title hb-display hb-clamp-2">{{ song?.name || '未在播放' }}</h1>

        <div class="np__meta">
          <span class="np__album hb-clamp-1">{{ song?.al?.name || '—' }}</span>
          <div v-if="song && hasArtistLink" class="np__artists hb-clamp-1 artist-links">
            <template v-for="(a, i) in artistLinks" :key="a.id || `local-${i}`">
              <span v-if="i" class="artist-links__sep"> / </span>
              <button
                v-if="a.id"
                class="artist-links__btn"
                :title="`前往 ${a.name} 的主页`"
                @click="goArtist(a.id)"
              >{{ a.name }}</button>
              <span v-else>{{ a.name }}</span>
            </template>
          </div>
          <span v-else class="np__artists hb-clamp-1">{{ artists }}</span>
        </div>

        <PlayerProgress class="np__progress" :progress="player.progress" :duration="player.duration" :live="settings.seekLive" @seek="seek" />

        <div class="np__times hb-mono">
          <span>{{ formatTime(player.progress) }}</span>
          <span>{{ formatTime(player.duration) }}</span>
        </div>

        <div class="np__controls">
          <div class="np__controls-side">
            <button
              class="np__icon"
              :class="{ 'is-active': isLiked(song) }"
              title="喜欢"
              @click="toggleLike(song)"
            >
              <Icon name="heart" :size="16" />
            </button>
            <button class="np__icon" :title="MODE_NAMES[player.playMode]" @click="cyclePlayMode()">
              <Icon :name="MODE_ICONS[player.playMode]" :size="15" />
            </button>
          </div>

          <div class="np__controls-main">
            <button class="np__ctrl" title="上一首" @click="prev()">
              <Icon name="prev" :size="17" />
            </button>
            <button class="np__ctrl np__ctrl--main" :title="player.playing ? '暂停' : '播放'" @click="toggle()">
              <Icon :name="player.playing ? 'pause' : 'play'" :size="20" />
            </button>
            <button class="np__ctrl" title="下一首" @click="next()">
              <Icon name="next" :size="17" />
            </button>
          </div>

          <div class="np__controls-side np__controls-side--end">
            <button class="np__icon" title="下载到本地" @click="downloadSong(song)">
              <Icon name="download" :size="16" />
            </button>
            <button class="np__icon" title="添加到歌单" :disabled="!song" @click="ui.openAddToPlaylist(song)">
              <Icon name="playlist-add" :size="16" />
            </button>
          </div>
        </div>

        <div class="np__volume">
          <span class="hb-mono">VOLUME</span>
          <input
            class="np__volume-range"
            type="range"
            min="0"
            max="1"
            step="0.01"
            :value="player.volume"
            @input="onVolume"
          />
          <span class="hb-mono np__volume-value">{{ Math.round(player.volume * 100) }}</span>
        </div>
      </div>

      <div v-if="rightView === 'lyric' && settings.showLyric" class="np__lyrics">
        <div class="np__lyric-head">
          <span class="hb-label hb-label--ghost">LYRIC</span>
          <span class="hb-mono hb-muted">{{ lines.length ? `${lines.length} 行` : '无歌词' }}</span>
        </div>

        <div ref="lyricRef" class="np__lyric-list hb-scroll">
          <p
            v-for="(line, index) in lines"
            :key="`${line.time}-${index}`"
            class="line"
            :class="{ 'is-active': index === activeIndex }"
            @click="seek(line.time)"
          >
            <span class="line__text">{{ line.text }}</span>
            <span v-if="settings.showTrans && line.trans" class="line__trans">{{ line.trans }}</span>
            <span v-if="settings.showRoma && line.roma" class="line__roma">{{ line.roma }}</span>
          </p>

          <p v-if="!lines.length" class="line line--empty">
            {{ player.lyricLoading ? '正在载入歌词…' : '纯音乐，请欣赏' }}
          </p>
        </div>
      </div>

      <div v-else-if="rightView === 'comment' && commentTarget" class="np__comments hb-scroll">
        <CommentPanel :type="commentTarget.type" :id="commentTarget.id" :page-size="15" />
      </div>
    </div>

    <!-- 右下角工具Dock：歌词 T / 翻译 译 / 罗马音 音 / 评论气泡 -->
    <div class="np__tools hb-acrylic">
      <button
        class="np__tool"
        :class="{ 'is-on': rightView === 'lyric' && settings.showLyric }"
        title="歌词开关"
        @click="toggleLyric"
      ><span class="np__tool-glyph">T</span></button>
      <button
        class="np__tool"
        :class="{ 'is-on': rightView === 'lyric' && settings.showTrans }"
        :disabled="rightView !== 'lyric' || !settings.showLyric"
        title="翻译"
        @click="toggleOption('showTrans')"
      ><span class="np__tool-glyph">译</span></button>
      <button
        class="np__tool"
        :class="{ 'is-on': rightView === 'lyric' && settings.showRoma }"
        :disabled="rightView !== 'lyric' || !settings.showLyric"
        title="罗马音"
        @click="toggleOption('showRoma')"
      ><span class="np__tool-glyph">音</span></button>
      <button
        class="np__tool"
        :class="{ 'is-on': rightView === 'comment' }"
        :disabled="!commentTarget"
        :title="commentTarget ? '评论' : '本地歌曲暂无评论'"
        @click="toggleComment"
      ><Icon name="comment" :size="16" /></button>
    </div>
  </section>
</template>

<style scoped lang="scss">
.np {
  position: fixed;
  inset: 0;
  z-index: 80;
  background-color: var(--paper);
  background-image:
    linear-gradient(var(--grid) 1px, transparent 1px),
    linear-gradient(90deg, var(--grid) 1px, transparent 1px);
  background-size: 24px 24px;
  overflow: hidden;
  display: flex;
  flex-direction: column;

  &__bg {
    display: none;
  }

  &::after {
    content: none;
  }

  > * {
    position: relative;
    z-index: 1;
  }

  &__top {
    height: 72px;
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 var(--gutter);
  }

  &__top-right {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  &__body {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 420px minmax(0, 1fr);
    /* 行高必须锁死，否则歌词列会被内容撑开、永远不出现滚动条 */
    grid-template-rows: minmax(0, 1fr);
    gap: 64px;
    padding: 6px var(--gutter) 44px;
  }

  /* 左栏：内容整体垂直居中。
     safe center 在内容超出可视区时自动回退到顶部对齐，避免顶部被裁掉滚不到。 */
  &__left {
    display: flex;
    flex-direction: column;
    min-width: 0;
    justify-content: center;
    justify-content: safe center;
  }

  &__cover {
    width: 330px;
    height: 330px;
    background: var(--surface);
    flex: none;

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

  &__title {
    margin-top: 26px;
    font-size: 30px;
    line-height: 1.2;
    color: var(--ink);
    max-width: 380px;
  }

  &__meta {
    margin-top: 10px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-width: 380px;
  }

  &__album {
    font-family: var(--font-mono), monospace;
    font-size: 9px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted);
  }

  &__artists {
    font-size: 12px;
    color: var(--ink-soft);

    &--link {
      display: block;
      width: fit-content;
      max-width: 100%;
      padding: 0;
      border: 0;
      background: transparent;
      font: inherit;
      font-size: 12px;
      text-align: left;
      cursor: pointer;
      transition: color 0.16s;

      &:hover {
        color: var(--accent);
        text-decoration: underline;
        text-underline-offset: 2px;
      }
    }
  }

  &__progress {
    margin-top: 22px;
    max-width: 380px;
  }

  &__times {
    display: flex;
    justify-content: space-between;
    max-width: 380px;
    font-size: 9px;
    color: var(--muted);
    margin-top: 2px;
  }

  &__controls {
    margin-top: 22px;
    display: flex;
    align-items: center;
    gap: 10px;
    max-width: 380px;
  }

  &__ctrl {
    width: 52px;
    height: 52px;
    display: grid;
    place-items: center;
    color: var(--ink);
    transition: background 0.16s, color 0.16s;

    &:hover {
      background: var(--hover);
    }

    &--main {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: var(--accent);
      color: var(--on-accent);

      &:hover {
        background: var(--accent-dark);
        color: var(--on-accent);
      }
    }
  }

  &__mode {
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    color: var(--muted);
    margin-left: 4px;

    &:hover {
      color: var(--ink);
    }

    &.is-active {
      color: var(--accent);
    }
  }

  &__volume {
    margin-top: 24px;
    display: flex;
    align-items: center;
    gap: 12px;
    max-width: 380px;
    color: var(--muted);

    &-range {
      -webkit-appearance: none;
      flex: 1;
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
        height: 14px;
        background: var(--ink);
        margin-top: -6.5px;
      }
    }

    &-value {
      width: 26px;
      text-align: right;
      font-size: 9px;
    }
  }

  /* 歌词 */
  &__lyrics {
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    padding-top: 10px;
  }

  &__lyric-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--line);
  }

  &__lyric-list {
    position: relative;
    flex: 1;
    min-height: 0;
    padding: 26px 12px 40vh 0;
    mask-image: linear-gradient(180deg, transparent 0, #000 8%, #000 82%, transparent 100%);
  }

  /* 评论视图：整块可滚动，隐藏滚动条保持与歌词一致的洁净感 */
  &__comments {
    min-width: 0;
    min-height: 0;
    flex: 1;
    overflow-y: auto;
    padding: 14px 12px 40px 2px;
    animation: np-rise 0.46s var(--ease) 0.05s both;
  }
}

.line {
  position: relative;
  display: block;
  margin: 0 0 16px;
  padding-left: 13px;
  cursor: pointer;
  font-family: var(--font-display), 'PingFang SC', sans-serif;
  color: var(--muted);
  transition: color 0.2s, transform 0.24s var(--ease);

  &__text {
    display: inline-block;
    font-weight: 400;
    font-size: var(--lyric-size);
    line-height: 1.6;
    padding: 1px 0;
    transition: background 0.18s, color 0.18s;
  }

  /* 罗马音与翻译必须是同一层级：同样的位置（正文下一行）、字号与颜色，
     只是内容不同。以前罗马音用 0.76em + --muted，看起来像挤在中间的另一层。 */
  &__trans,
  &__roma {
    display: block;
    font-family: var(--font-text), sans-serif;
    font-weight: 400;
    font-size: var(--trans-size);
    color: var(--faint);
    padding: 0 6px;
    margin-top: 1px;
    line-height: 1.5;
  }

  &:hover {
    color: var(--muted);
  }

  &.is-active {
    color: var(--ink);

    .line__text {
      font-weight: bold;
      color: var(--ink);
    }

    &::before {
      content: '';
      position: absolute;
      left: 0;
      top: 7px;
      bottom: 7px;
      width: 2px;
      background: var(--ink);
    }

    .line__trans,
    .line__roma {
      color: var(--ink-soft);
    }
  }

  &--empty {
    color: var(--faint);
    font-size: 16px;
  }
}
/* ---- 退出按钮 / 歌词开关 / 控件排布（覆盖前面同选择器） ---- */
.np__top {
  justify-content: flex-start;
  gap: 16px;
}

.np__exit {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 10px 0 6px;
  border: 1px solid var(--line);
  color: var(--ink-soft);
  transition: background 0.16s, color 0.16s, border-color 0.16s;
}

.np__exit:hover {
  background: var(--ink);
  color: var(--paper);
  border-color: var(--ink);
}

.np__badge {
  margin: 0;
}

.np__top-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 16px;
}

.np__toggle {
  display: flex;
}

.np__toggle button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 9px;
  margin-left: -1px;
  border: 1px solid var(--line-strong);
  font-size: 11px;
  color: var(--ink-soft);
  transition: background 0.14s, color 0.14s;
}

.np__toggle button:first-child {
  margin-left: 0;
}

.np__toggle button:hover {
  background: var(--hover);
}

.np__toggle button.is-on {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--on-accent);
}

.np__toggle-state {
  font-size: 8px;
  opacity: 0.85;
}

/* 控件：三栏网格，播放键严格落在封面中轴上。
   两侧用 minmax(0,1fr) 而不是 1fr：1fr 的最小尺寸是 auto，
   右侧按钮一多就会把列撑宽、把中间组挤偏（曾经偏左约 30px）。
   左「喜欢 + 播放模式」/ 右「下载 + 添加到歌单」各 2 个，左右对称。 */
.np__controls {
  width: 330px;
  max-width: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 0;
}

.np__controls-side {
  display: flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
}

.np__controls-side--end {
  justify-content: flex-end;
}

.np__controls-main {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: none;
}

.np__ctrl {
  width: 42px;
  height: 42px;
}

.np__ctrl--main {
  width: 54px;
  height: 54px;
  margin: 0 3px;
}

.np__icon {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  color: var(--muted);
  transition: color 0.16s, background 0.16s;
}

.np__icon:hover {
  color: var(--ink);
  background: var(--hover);
}

.np__icon.is-active {
  color: var(--accent);
}

.np__body--single {
  grid-template-columns: 460px;
}

/* 进场 / 退场：交给 Vue 过渡类，不能用 animation + fill:both，
   否则动画会长期占用 opacity，退场过渡被覆盖，视觉上就是“瞬间消失”。

   动效：从下方滑入的同时由虚变实（blur 18px → 0），退出反向加速模糊。
   两条曲线不同才像“真实的运动”：进场 expo-out（快进慢停），
   出场 ease-in（慢起、越走越快）。 */
.np-enter-active {
  transition: opacity 0.32s cubic-bezier(0.16, 1, 0.3, 1),
    transform 0.46s cubic-bezier(0.16, 1, 0.3, 1),
    filter 0.46s cubic-bezier(0.16, 1, 0.3, 1);
  will-change: opacity, transform, filter;
}

.np-leave-active {
  transition: opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1),
    transform 0.3s cubic-bezier(0.4, 0, 0.2, 1),
    filter 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: none;
  will-change: opacity, transform, filter;
}

.np-enter-from {
  opacity: 0;
  transform: translateY(28px) scale(0.982);
  filter: blur(18px);
}

.np-leave-to {
  opacity: 0;
  transform: translateY(16px) scale(0.99);
  filter: blur(24px);
}

.np__left {
  animation: np-rise 0.42s var(--ease) both;
}

.np__lyrics {
  animation: np-rise 0.46s var(--ease) 0.05s both;
}

.np__cover {
  animation: np-cover 0.5s var(--ease) both;
}

@keyframes np-rise {
  from { opacity: 0; transform: translateY(18px); }
  to { opacity: 1; transform: none; }
}

@keyframes np-cover {
  from { opacity: 0; transform: scale(0.97); }
  to { opacity: 1; transform: none; }
}
/* 歌词/翻译开关：等宽 + 等长，避免两个按钮长度不一 */
.np__toggle {
  gap: 6px;
}

.np__toggle button {
  min-width: 96px;
  justify-content: space-between;
  margin-left: 0;
  font-family: var(--font-mono);
  letter-spacing: 0.06em;
}
/* ---- 左栏高度约束 ----
   网格行锁死之后，左栏的超高内容会把 flex 子项压扁（标题会塌成 3px）。
   固定尺寸的元素一律禁止收缩，矮窗口再用媒体查询收紧间距。 */
.np__cover,
.np__title,
.np__meta,
.np__progress,
.np__times,
.np__controls,
.np__volume {
  flex: none;
}

.np__left {
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: none;
}

.np__left::-webkit-scrollbar {
  display: none;
}

@media (max-height: 760px) {
  .np__body {
    padding-bottom: 28px;
  }

  .np__cover {
    width: 300px;
    height: 300px;
  }

  .np__title {
    margin-top: 16px;
    font-size: 26px;
  }

  .np__meta {
    margin-top: 6px;
  }

  .np__progress {
    margin-top: 14px;
  }

  .np__controls {
    width: 300px;
    margin-top: 14px;
  }

  .np__volume {
    margin-top: 12px;
  }
}
/* ---- 背景：当前封面模糊放大 + 纸色薄雾 ----
   .np > * 会把所有直接子元素设成 relative/z-index:1，
   所以这几个覆盖必须写在最后，靠顺序赢过它。 */
.np__bg {
  position: absolute;
  inset: -14%;
  z-index: 0;
  display: block;
  background-size: cover;
  background-position: center;
  filter: blur(90px) saturate(150%);
  transform: scale(1.16);
  opacity: 1;
}

.np__veil {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  background: var(--np-wash);
}

.np__top,
.np__body {
  z-index: 2;
}
/* ---- 最大化适配：内容与顶栏同宽居中，封面随视口高度缩放 ---- */
.np {
  --np-cover: clamp(300px, 34vh, 440px);
}

.np__top {
  width: 100%;
  max-width: var(--page-max);
  margin-inline: auto;
}

.np__body {
  width: 100%;
  max-width: var(--page-max);
  margin-inline: auto;
  grid-template-columns: var(--np-cover) minmax(0, 1fr);
  gap: clamp(40px, 5vw, 96px);
}

.np__cover {
  position: relative;
  width: var(--np-cover);
  height: var(--np-cover);
}

.np__cover img {
  position: absolute;
  inset: 0;
}

.np__controls {
  width: var(--np-cover);
}

.np__lyrics {
  max-width: 1080px;
}

/* ---- 换歌：背景整层交叉淡入，同时从重度模糊收敛到常态 ---- */
.npbg-enter-active {
  transition: opacity 0.9s ease, filter 1s ease;
}

.npbg-leave-active {
  transition: opacity 0.9s ease;
}

.npbg-enter-from {
  opacity: 0;
  filter: blur(120px) saturate(150%);
}

.npbg-leave-to {
  opacity: 0;
}

.coverfade-enter-active {
  transition: opacity 0.55s cubic-bezier(0.16, 1, 0.3, 1),
    filter 0.55s cubic-bezier(0.16, 1, 0.3, 1),
    transform 0.55s cubic-bezier(0.16, 1, 0.3, 1);
}

.coverfade-leave-active {
  transition: opacity 0.4s ease;
}

.coverfade-enter-from {
  opacity: 0;
  filter: blur(18px);
  transform: scale(1.05);
}

.coverfade-leave-to {
  opacity: 0;
  filter: blur(12px);
}

/* 多位歌手各自可点：A / B / C 分别跳各自的歌手页 */
.np__meta .artist-links {
  max-width: 100%;
  white-space: nowrap;

  &__sep { color: var(--faint); }

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
      color: var(--accent);
      text-decoration: underline;
      text-underline-offset: 2px;
    }
  }
}

/* ---- 右下角工具 Dock：T / 译 / 音 / 评论 ---- */
.np__tools {
  position: absolute;
  right: var(--gutter);
  bottom: 24px;
  z-index: 3;
  display: flex;
  gap: 6px;
  padding: 6px;
  border: 1px solid var(--line);
  animation: np-rise 0.5s var(--ease) 0.12s both;
}

.np__tool {
  position: relative;
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border: 1px solid var(--line-strong);
  background: transparent;
  color: var(--ink-soft);
  cursor: pointer;
  overflow: hidden;
  transition: background 0.2s var(--ease), border-color 0.2s var(--ease),
    color 0.2s var(--ease), transform 0.2s var(--ease), box-shadow 0.2s var(--ease);

  &:hover:not(:disabled) {
    transform: translateY(-2px);
    border-color: var(--ink);
    color: var(--ink);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  }

  &:active:not(:disabled) {
    transform: translateY(0) scale(0.94);
  }

  &:disabled {
    opacity: 0.32;
    cursor: default;
  }

  &.is-on {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--on-accent);
    animation: tool-pop 0.32s var(--ease);
  }
}

.np__tool-glyph {
  font-family: var(--font-mono);
  font-size: 15px;
  line-height: 1;
  transition: transform 0.2s var(--ease);
}

.np__tool:hover .np__tool-glyph {
  transform: scale(1.12);
}

@keyframes tool-pop {
  0% { transform: scale(0.86); filter: blur(4px); }
  55% { transform: scale(1.08); filter: blur(0); }
  100% { transform: scale(1); }
}

/* 切歌：歌词/信息整块先轻微模糊+下沉，再收敛回清晰，
   与 .npbg（背景）和 .coverfade（封面）的 0.9s / 0.55s 交叠。 */
.np__body--changing .np__left,
.np__body--changing .np__lyrics,
.np__body--changing .np__comments {
  animation: song-change 0.6s var(--ease) both;
}

.np__body--changing .np__lyrics,
.np__body--changing .np__comments {
  animation-delay: 0.06s;
}

@keyframes song-change {
  0% { opacity: 0.55; filter: blur(10px); transform: translateY(8px); }
  100% { opacity: 1; filter: blur(0); transform: none; }
}
</style>

