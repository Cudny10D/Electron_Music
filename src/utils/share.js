import api from './windowApi'
import { useUiStore } from '../store/uiStore'

const BASE = 'https://music.163.com'

export const SHARE_TYPES = {
  playlist: { path: 'playlist', label: '歌单' },
  album: { path: 'album', label: '专辑' },
  artist: { path: 'artist', label: '歌手' },
  song: { path: 'song', label: '歌曲' }
}

/** 网易云外链：/playlist|album|artist|song?id=xxx */
export function shareLink(type, id) {
  const conf = SHARE_TYPES[type]
  if (!conf || !id) return ''
  return `${BASE}/${conf.path}?id=${encodeURIComponent(id)}`
}

/** 分享文案（复制为纯链接时不用） */
export function shareText(type, item) {
  const conf = SHARE_TYPES[type]
  if (!conf) return ''
  const name = item?.name || ''
  const artist = type === 'song' ? (item?.ar || item?.artists || []).map((a) => a.name).join(' / ') : ''
  if (!name) return conf.label
  return `【${conf.label}】${name}${artist ? ` - ${artist}` : ''}`
}

/**
 * 复制链接到剪贴板。
 * 桌面端走主进程 clipboard（不受页面焦点影响），浏览器 shim 用 navigator.clipboard。
 */
export async function copyShare(type, item, opts = {}) {
  const url = shareLink(type, item?.id)
  if (!url) return false
  const text = opts.withText ? `${shareText(type, item)}\n${url}` : url

  let ok = true
  try {
    if (api.copyTxt) await api.copyTxt(text)
    else await navigator.clipboard.writeText(text)
  } catch (err) {
    try {
      await navigator.clipboard.writeText(text)
    } catch (e) {
      ok = false
    }
  }

  const ui = useUiStore()
  ui.toast(ok ? (opts.toast || `${SHARE_TYPES[type].label}链接已复制`) : '复制失败，请检查剪贴板权限', ok ? 'info' : 'error')
  return ok
}
