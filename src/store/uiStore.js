import { defineStore } from 'pinia'

let seq = 0

export const useUiStore = defineStore('uiStore', {
  state: () => ({
    toasts: [],
    nowPlayingOpen: false,
    queueOpen: false,
    downloadsOpen: false,
    // 全局「添加到歌单」弹窗：歌曲行 / 全屏播放器 / 底栏三处共用同一个入口
    addToPlaylistSong: null
  }),
  actions: {
    openAddToPlaylist(song) {
      if (!song) return
      if (song.local) return this.toast('本地歌曲无法添加到在线歌单', 'error')
      if (!song.id) return this.toast('这首歌没有可用的网易云 ID', 'error')
      // 只留弹窗需要的字段，避免把整个响应式 song 对象挂到全局状态上
      this.addToPlaylistSong = {
        id: song.id,
        name: song.name,
        ar: song.ar || song.artists || [],
        al: song.al || {}
      }
    },
    closeAddToPlaylist() {
      this.addToPlaylistSong = null
    },
    toast(text, type = 'info', ttl = 2400) {
      const id = ++seq
      this.toasts.push({ id, text, type })
      setTimeout(() => this.dismiss(id), ttl)
    },
    dismiss(id) {
      this.toasts = this.toasts.filter((t) => t.id !== id)
    },
    toggleNowPlaying(open) {
      this.nowPlayingOpen = open === undefined ? !this.nowPlayingOpen : open
    },
    toggleQueue(open) {
      this.queueOpen = open === undefined ? !this.queueOpen : open
      if (this.queueOpen) this.downloadsOpen = false // 两个抽屉不叠在一起
    },
    toggleDownloads(open) {
      this.downloadsOpen = open === undefined ? !this.downloadsOpen : open
      if (this.downloadsOpen) this.queueOpen = false // 两个抽屉不叠在一起
    }
  }
})
