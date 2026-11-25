<script setup>
import { computed } from 'vue'

const props = defineProps({
  name: { type: String, required: true },
  size: { type: [Number, String], default: 18 },
  weight: { type: [Number, String], default: 1.5 }
})

const FILLED = new Set(['play', 'pause', 'prev', 'next', 'dots'])

const ICONS = {
  play: '<path d="M8 5.2v13.6L19 12z"/>',
  pause: '<path d="M7 5h3.4v14H7zM13.6 5H17v14h-3.4z"/>',
  prev: '<path d="M18.5 5.6v12.8L9.5 12z"/><rect x="5" y="5.6" width="2.1" height="12.8"/>',
  next: '<path d="M5.5 5.6v12.8L14.5 12z"/><rect x="16.9" y="5.6" width="2.1" height="12.8"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M16.5 16.5 21 21"/>',
  heart:
    '<path d="M12 20.2S4.5 15.4 4.5 10.6A3.9 3.9 0 0 1 12 8.2a3.9 3.9 0 0 1 7.5 2.4c0 4.8-7.5 9.6-7.5 9.6z"/>',
  queue: '<path d="M4 7h11M4 12h11M4 17h7"/><path d="M17.5 14v6l4.5-3z" fill="currentColor" stroke="none"/>',
  volume: '<path d="M4 9.8v4.4h3l4.2 3.2V6.6L7 9.8H4z"/><path d="M15 9a4.2 4.2 0 0 1 0 6"/>',
  mute: '<path d="M4 9.8v4.4h3l4.2 3.2V6.6L7 9.8H4z"/><path d="M15.5 10l4 4M19.5 10l-4 4"/>',
  'mode-sequential': '<path d="M4 7h10M4 12h10M4 17h6"/><path d="M14.5 14.5 18 18l-3.5 3.5"/>',
  'mode-loop':
    '<path d="M16.5 3.5 20 7l-3.5 3.5"/><path d="M3.5 11.5V10a3 3 0 0 1 3-3H19"/><path d="M7.5 20.5 4 17l3.5-3.5"/><path d="M20.5 12.5V14a3 3 0 0 1-3 3H5"/>',
  'mode-one':
    '<path d="M16.5 3.5 20 7l-3.5 3.5"/><path d="M3.5 11.5V10a3 3 0 0 1 3-3H19"/><path d="M7.5 20.5 4 17l3.5-3.5"/><path d="M20.5 12.5V14a3 3 0 0 1-3 3H5"/><path d="M11.2 10.6 12.6 10v4.2"/>',
  'mode-shuffle':
    '<path d="M16 3.5h5v5"/><path d="M4 20.5 21 3.5"/><path d="M21 16v5h-5"/><path d="M15.5 15.5 21 21"/><path d="M4 4l4.5 4.5"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  min: '<path d="M5 12h14"/>',
  max: '<rect x="5.5" y="5.5" width="13" height="13"/>',
  restore: '<rect x="8.5" y="8.5" width="10" height="10"/><path d="M5.5 15.5v-10h10"/>',
  more: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
  'chevron-left': '<path d="M14.5 6 8.5 12l6 6"/>',
  'chevron-right': '<path d="M9.5 6l6 6-6 6"/>',
  disc: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2.2"/>',
  user: '<circle cx="12" cy="8.4" r="3.6"/><path d="M4.8 20.2a7.2 7.2 0 0 1 14.4 0"/>',
  logout: '<path d="M14 4.5H6.5v15H14"/><path d="M17 12H10"/><path d="M14.5 8.5 18 12l-3.5 3.5"/>',
  check: '<path d="M5 12.5 9.5 17 19 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 6.3"/><path d="M20 4.5V11h-6"/>',
  music: '<circle cx="8" cy="17" r="3"/><circle cx="18" cy="15" r="3"/><path d="M11 17V7l10-2v10"/>',
  download:
    '<path d="M12 4v10"/><path d="M8 10.5 12 14.5l4-4"/><path d="M5 17v2.5h14V17"/>',
  album: '<rect x="4" y="4" width="16" height="16"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/>',
  arrow: '<path d="M4 12h15"/><path d="M14 7l5 5-5 5"/>',
  // 分享：三节点连线，比右箭头更贴合「复制链接分享」的语义，且是同一套细线语言
  share: '<circle cx="18" cy="5.5" r="2.4"/><circle cx="6" cy="12" r="2.4"/><circle cx="18" cy="18.5" r="2.4"/><path d="M8.1 10.8 15.9 6.7M8.1 13.2l7.8 4.1"/>',
  settings: '<circle cx="12" cy="12" r="3.1"/><path d="M12 3.4v2.3M12 18.3v2.3M20.6 12h-2.3M5.7 12H3.4M18.1 5.9l-1.6 1.6M7.5 16.5l-1.6 1.6M18.1 18.1l-1.6-1.6M7.5 7.5 5.9 5.9"/>',
  // 评论：聊天气泡
  comment: '<path d="M20 11.5a7.5 7.5 0 0 1-11.1 6.6L4 19.5l1.5-4A7.5 7.5 0 1 1 20 11.5z"/>',
  'playlist-add': '<path d="M4 6.5h11M4 11h11M4 15.5h7"/><path d="M17 13.5v7M13.5 17h7"/>',
  folder: '<path d="M3.5 6.5h6l2 2h9v10.5h-17z"/><path d="M3.5 6.5v-1.5h5"/>',
  stop: '<rect x="6" y="6" width="12" height="12"/>',
  trash: '<path d="M5 7h14M9 7V4.5h6V7M7 7l1 13h8l1-13"/>',
  // 桌面歌词：一个音符 + 两行文字
  lyrics: '<path d="M4 6h9M4 10h7M4 14h9"/><path d="M15 17.5V8l5-1v9"/><circle cx="13.2" cy="17.5" r="1.8"/><circle cx="18.2" cy="16.5" r="1.8"/>',
  // 云盘分类：图片 / 视频 / 压缩包 / 文档 / 上传
  image:
    '<rect x="3.5" y="4.5" width="17" height="15" rx="1"/><circle cx="9" cy="10" r="2"/><path d="M4 17l5-5 4 4 3-3 4 4"/>',
  video: '<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M10 9l5 3-5 3z" fill="currentColor" stroke="none"/>',
  archive:
    '<rect x="4.5" y="3.5" width="15" height="17" rx="1"/><path d="M9 3.5v3h6v-3"/><path d="M12 9.5v6M9.5 12h5"/>',
  doc: '<path d="M6 3.5h8l4 4v13H6z"/><path d="M14 3.5v4h4"/><path d="M9 12h6M9 15.5h6"/>',
  upload: '<path d="M12 16V4"/><path d="M8 8l4-4 4 4"/><path d="M4 16v3.5h16V16"/>'
}

const inner = computed(() => ICONS[props.name] || '')
const filled = computed(() => FILLED.has(props.name))
</script>

<template>
  <svg
    class="hb-icon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    :fill="filled ? 'currentColor' : 'none'"
    :stroke="filled ? 'none' : 'currentColor'"
    :stroke-width="weight"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    v-html="inner"
  />
</template>

<style scoped>
.hb-icon {
  display: block;
  flex: none;
}
</style>
