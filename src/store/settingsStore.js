import { defineStore } from 'pinia'
import api from '../utils/windowApi'
import { usePlayerStore } from './playerStore'

export const ACCENTS = [
  { name: '橄榄', value: '#6f754d' },
  { name: '靛蓝', value: '#3f5d7a' },
  { name: '赭红', value: '#8c4a38' },
  { name: '灰紫', value: '#6b5570' },
  { name: '墨黑', value: '#2f2c26' }
]

export const QUALITIES = [
  { label: '标准', value: 'standard' },
  { label: '较高', value: 'higher' },
  { label: '极高', value: 'exhigh' },
  { label: '无损', value: 'lossless' },
  { label: 'Hi-Res', value: 'hires' }
]

export const PLAY_MODES = [
  { label: '顺序', value: 0 },
  { label: '列表', value: 1 },
  { label: '单曲', value: 2 },
  { label: '随机', value: 3 }
]

export function hexToRgb(hex) {
  const clean = String(hex).replace('#', '')
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
  const num = parseInt(full, 16)
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 }
}

export function toRgba(hex, alpha) {
  const { r, g, b } = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function darken(hex, amount) {
  const { r, g, b } = hexToRgb(hex)
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * (1 - amount))))
  return `#${[f(r), f(g), f(b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

/**
 * accent 上的文字色必须跟着 accent 本身的亮度走，不能按亮/暗主题写死：
 * 用户选「赭红 / 墨黑」这类深 accent 时，暗色主题原本给的 --on-accent 是深色，
 * 就会变成「深底深字」（全屏播放器的开关、播放大圆都看不清）。
 * 这里按 WCAG 相对亮度自动挑浅字或深字。
 */
export function onAccentFor(hex) {
  const { r, g, b } = hexToRgb(hex)
  const lin = (v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  return luminance > 0.42 ? '#141410' : '#f7f6f2'
}

export function hexToHsl(hex) {
  const { r, g, b } = hexToRgb(hex)
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6
    else if (max === gn) h = ((bn - rn) / d + 2) / 6
    else h = ((rn - gn) / d + 4) / 6
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) }
}

export function hslToHex({ h, s, l }) {
  const sn = s / 100
  const ln = l / 100
  const k = (n) => (n + h / 30) % 12
  const a = sn * Math.min(ln, 1 - ln)
  const f = (n) => ln - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  const toHex = (v) => Math.round(255 * v).toString(16).padStart(2, '0')
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`
}

/** Windows 路径 -> file:// URL，供 CSS background 使用 */
export function toFileUrl(filePath) {
  const normalized = String(filePath).replace(/\\/g, '/')
  return encodeURI(`file:///${normalized}`)
}

export const useSettingsStore = defineStore('settingsStore', {
  state: () => ({
    // 外观
    accent: '#6f754d',
    theme: 'auto',
    customBg: '',
    grid: true,
    uiScale: 100,
    // 低性能：关掉模糊 / 过渡 / 半透明，换取低端设备的流畅度
    lowPerformance: false,
    // 播放
    quality: 'exhigh',
    startVolume: 70,
    startPlayMode: 1,
    seekLive: true,
    crossfade: true,
    // 歌词
    lyricSize: 19,
    transSize: 12,
    showLyric: true,
    showTrans: true,
    showRoma: false,
    hideCredits: false,
    // 下载
    downloadFolder: '',
    downloadConcurrency: 3,
    // 系统
    globalShortcuts: true,
    quitApp: 'minimize',
    rememberWindow: true
  }),
  actions: {
    apply() {
      const root = document.documentElement
      root.style.setProperty('--accent', this.accent)
      root.style.setProperty('--accent-dark', darken(this.accent, 0.2))
      root.style.setProperty('--accent-weak', toRgba(this.accent, 0.12))
      root.style.setProperty('--on-accent', onAccentFor(this.accent))
      root.style.setProperty('--lyric-size', `${this.lyricSize}px`)
      root.style.setProperty('--trans-size', `${this.transSize}px`)

      // 主题：auto 跟随系统
      const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches
      const dark = this.theme === 'dark' || (this.theme === 'auto' && prefersDark)
      document.documentElement.dataset.theme = dark ? 'dark' : 'light'

      const app = document.getElementById('app')
      if (app) {
        app.classList.toggle('is-plain', !this.grid)
        app.style.zoom = String(this.uiScale / 100)
        root.classList.toggle('low-perf', this.lowPerformance)

        if (this.customBg) {
          app.classList.add('has-bg')
          app.style.setProperty('--bg-image', `url("${toFileUrl(this.customBg)}")`)
        } else {
          app.classList.remove('has-bg')
          app.style.removeProperty('--bg-image')
        }
      }
    },

    hydrate(remote) {
      if (!remote) return this.apply()
      if (remote.music?.level) this.quality = remote.music.level
      if (typeof remote.other?.globalShortcuts === 'boolean') this.globalShortcuts = remote.other.globalShortcuts
      if (remote.other?.quitApp) this.quitApp = remote.other.quitApp
      if (typeof remote.other?.rememberWindow === 'boolean') this.rememberWindow = remote.other.rememberWindow
      if (remote.download?.folder) this.downloadFolder = remote.download.folder
      if (remote.download?.concurrency) this.downloadConcurrency = remote.download.concurrency
      this.apply()
    },

    syncRemote() {
      api.setSettings({
        music: { level: this.quality },
        download: { folder: this.downloadFolder, concurrency: this.downloadConcurrency },
        other: {
          quitApp: this.quitApp,
          globalShortcuts: this.globalShortcuts,
          rememberWindow: this.rememberWindow
        }
      })
    },

    setAccent(value) {
      this.accent = value
      this.apply()
      this.syncRemote()
    },

    setAccentHsl(hsl) {
      this.setAccent(hslToHex(hsl))
    },

    update(patch) {
      Object.assign(this, patch)
      if ('quality' in patch) usePlayerStore().quality = patch.quality
      this.apply()
      this.syncRemote()
    },

    reset() {
      this.accent = '#6f754d'
      this.theme = 'auto'
      this.customBg = ''
      this.grid = true
      this.uiScale = 100
      this.lowPerformance = false
      this.quality = 'exhigh'
      this.startVolume = 70
      this.startPlayMode = 1
      this.seekLive = true
      this.crossfade = true
      this.lyricSize = 19
      this.transSize = 12
      this.showLyric = true
      this.showTrans = true
      this.showRoma = false
      this.hideCredits = false
      this.downloadFolder = ''
      this.downloadConcurrency = 3
      this.globalShortcuts = true
      this.quitApp = 'minimize'
      this.rememberWindow = true
      usePlayerStore().quality = this.quality
      this.apply()
      this.syncRemote()
    }
  },
  persist: {
    storage: localStorage,
    paths: [
      'accent',
      'theme',
      'customBg',
      'grid',
      'uiScale',
      'lowPerformance',
      'quality',
      'startVolume',
      'startPlayMode',
      'seekLive',
      'crossfade',
      'lyricSize',
      'transSize',
      'showLyric',
      'showTrans',
      'showRoma',
      'hideCredits',
      'downloadFolder',
      'downloadConcurrency',
      'globalShortcuts',
      'quitApp',
      'rememberWindow'
    ]
  }
})
