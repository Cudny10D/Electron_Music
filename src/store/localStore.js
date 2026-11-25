import { defineStore } from 'pinia'
import api from '../utils/windowApi'
import { useSettingsStore } from './settingsStore'
import { useUiStore } from './uiStore'
import { playList } from '../utils/player'
import { formatBytes } from '../utils/format'

/** 本地音乐：用户添加的目录 + 下载目录里的音频文件 */
export const useLocalStore = defineStore('localStore', {
  state: () => ({
    folders: [],
    includeDownloads: true,
    files: [],
    scanning: false,
    error: '',
    scannedAt: 0
  }),

  getters: {
    localFiles: (s) => s.files.filter((f) => f.source === 'local'),
    downloadedFiles: (s) => s.files.filter((f) => f.source === 'download'),
    totalSize: (s) => s.files.reduce((acc, f) => acc + (f.size || 0), 0),
    sizeText: (s) => formatBytes(s.files.reduce((acc, f) => acc + (f.size || 0), 0))
  },

  actions: {
    async addFolders() {
      let picked = []
      try {
        picked = (await api.pickLocalFolders()) || []
      } catch (err) {
        this.error = err?.message || '无法打开目录选择框'
        return 0
      }
      if (!picked.length) return 0
      let added = 0
      for (const p of picked) {
        if (!this.folders.includes(p)) {
          this.folders.push(p)
          added++
        }
      }
      if (added) await this.scan()
      else useUiStore().toast('这些目录已经在列表里了')
      return added
    },

    removeFolder(dir) {
      this.folders = this.folders.filter((f) => f !== dir)
      this.scan()
    },

    setIncludeDownloads(value) {
      this.includeDownloads = !!value
      this.scan()
    },

    async scan() {
      if (this.scanning) return
      this.scanning = true
      this.error = ''
      try {
        const settings = useSettingsStore()
        let dlDir = settings.downloadFolder || ''
        if (this.includeDownloads && !dlDir) {
          try {
            dlDir = await api.getDownloadDir()
          } catch (err) {
            // 拿不到就只扫用户目录
          }
        }

        // 必须传普通数组：Pinia 的响应式 Proxy 无法被 IPC 结构化克隆
        const local = (await api.scanLocalFolders(Array.from(this.folders))) || []
        let downloaded = []
        if (this.includeDownloads && dlDir && !this.folders.includes(dlDir)) {
          // 下载文件名是「歌名 - 歌手」，与通用目录相反
          downloaded = (await api.scanLocalFolders([dlDir], { nameOrder: 'song-artist' })) || []
        }

        const seen = new Set()
        const merged = []
        for (const f of [...local.map((f) => ({ ...f, source: 'local' })), ...downloaded.map((f) => ({ ...f, source: 'download' }))]) {
          if (seen.has(f.path)) continue
          seen.add(f.path)
          merged.push(f)
        }
        this.files = merged
        this.scannedAt = Date.now()
      } catch (err) {
        this.error = err?.message || '扫描本地目录失败'
      } finally {
        this.scanning = false
      }
    },

    playFile(file, list) {
      const songs = list || this.files
      const index = songs.findIndex((f) => f.path === file.path)
      if (index < 0) return
      playList(songs, index, { kind: 'local', name: '本地音乐' })
    },

    playAll(list) {
      const songs = list || this.files
      if (!songs.length) return
      playList(songs, 0, { kind: 'local', name: '本地音乐' })
    }
  }
})
