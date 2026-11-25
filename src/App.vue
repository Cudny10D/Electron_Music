<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import TitleBar from './components/TitleBar.vue'
import MiniPlayer from './components/MiniPlayer.vue'
import NowPlaying from './components/NowPlaying.vue'
import QueuePanel from './components/QueuePanel.vue'
import DownloadPanel from './components/DownloadPanel.vue'
import ToastHost from './components/ToastHost.vue'
import AddToPlaylistDialog from './components/AddToPlaylistDialog.vue'
import { useUiStore } from './store/uiStore'
import { usePlayerStore } from './store/playerStore'
import { useSettingsStore } from './store/settingsStore'
import { toggle } from './utils/player'
import api from './utils/windowApi'
import { isCreditLine } from './utils/lyric'

const ui = useUiStore()
const player = usePlayerStore()
const settings = useSettingsStore()
const route = useRoute()
const bodyRef = ref(null)

/* ---- 桌面歌词：把播放状态推给独立浮窗 ---- */
let lyricTimer = null
function pushDesktopLyric() {
  const song = player.currentSong
  const lines = player.lyricLines || []
  // 过滤掉制作人员行再推，保持与全屏播放器一致
  const shown = settings.hideCredits ? lines.filter((l) => !isCreditLine(l.text)) : lines
  // 过滤后索引会偏移：用原当前行的时间反算过滤后的索引
  const activeTime = lines[player.lyricIndex]?.time
  let index = -1
  if (activeTime != null) {
    index = shown.findIndex((l) => l.time === activeTime)
  }
  api.updateDesktopLyric({
    songName: song ? `${song.name}${song.ar?.length ? ' · ' + song.ar.map((a) => a.name).join('/') : ''}` : '',
    lines: shown.map((l) => ({ text: l.text, time: l.time })),
    index,
    light: document.documentElement.dataset.theme !== 'dark'
  })
}
function scheduleLyricPush() {
  clearTimeout(lyricTimer)
  lyricTimer = setTimeout(pushDesktopLyric, 60)
}
watch(
  () => [player.currentSong?.id, player.lyricLines, player.lyricIndex, settings.hideCredits, settings.theme],
  scheduleLyricPush,
  { deep: false }
)
api.onDesktopLyricRequestState && api.onDesktopLyricRequestState(pushDesktopLyric)

// 滚动复位放在新页面入场前：离场动画还在播时不要突然跳回顶部
function resetScroll() {
  if (bodyRef.value) bodyRef.value.scrollTop = 0
}

// 全屏播放器打开时取消顶栏拖拽区。
// Electron 的 -webkit-app-region: drag 按元素矩形计算，不受 z-index 影响：
// 顶栏那条 64px 的空白/间隙会盖在播放器上面，把「退出」和歌词/翻译开关的点击吃掉。
watch(
  () => ui.nowPlayingOpen,
  (open) => document.documentElement.classList.toggle('np-open', open),
  { immediate: true }
)

function onKeydown(event) {
  if (event.key === 'Escape') {
    // 全局弹窗优先级最高，避免按 Esc 时把背后的抽屉一起关掉
    if (ui.addToPlaylistSong) ui.closeAddToPlaylist()
    else if (ui.downloadsOpen) ui.toggleDownloads(false)
    else if (ui.queueOpen) ui.toggleQueue(false)
    else if (ui.nowPlayingOpen) ui.toggleNowPlaying(false)
    return
  }

  const tag = document.activeElement?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA') return

  if (event.code === 'Space') {
    event.preventDefault()
    toggle()
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <TitleBar />

  <main ref="bodyRef" class="body hb-scroll">
    <RouterView v-slot="{ Component }">
      <!-- key 用 path 而不是 fullPath：只换 query（例如「我的音乐」切板块、
           搜索页换关键词）时不该触发整页上移 + 模糊过渡，组件内部自己处理局部动画。
           path 变了（换页面 / 换详情 id）仍走完整的 page 过渡。 -->
      <Transition name="page" mode="out-in" @before-enter="resetScroll">
        <component :is="Component" :key="route.path" />
      </Transition>
    </RouterView>
  </main>

  <MiniPlayer />

  <Transition name="np">
    <NowPlaying v-if="ui.nowPlayingOpen" />
  </Transition>

  <Transition name="fade">
    <QueuePanel v-if="ui.queueOpen" />
  </Transition>

  <Transition name="fade">
    <DownloadPanel v-if="ui.downloadsOpen" />
  </Transition>

  <Transition name="dlg">
    <AddToPlaylistDialog
      v-if="ui.addToPlaylistSong"
      :song="ui.addToPlaylistSong"
      @close="ui.closeAddToPlaylist()"
    />
  </Transition>

  <ToastHost />
</template>

<style scoped>
.body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  position: relative;
  /* 顶栏 / 底栏是 fixed 的，内容从它们下面穿过，靠这里留出可视区 */
  padding-top: var(--titlebar);
  padding-bottom: var(--player);
}
</style>
