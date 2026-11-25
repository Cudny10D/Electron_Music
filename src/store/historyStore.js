import { defineStore } from 'pinia'

/** 播放历史：最近播放的 300 首，新在前 */
export const useHistoryStore = defineStore('historyStore', {
  state: () => ({
    items: []
  }),
  getters: {
    count: (state) => state.items.length
  },
  actions: {
    push(song) {
      if (!song?.id) return
      const last = this.items[0]
      // 同一首 30 秒内重复加载不算新记录
      if (last && last.id === song.id && Date.now() - (last.playedAt || 0) < 30000) return

      const entry = {
        id: song.id,
        name: song.name,
        ar: (song.ar || []).map((a) => ({ id: a.id, name: a.name })),
        al: { id: song.al?.id, name: song.al?.name, picUrl: song.al?.picUrl },
        dt: song.dt,
        playedAt: Date.now()
      }
      // 本地文件没有网易云 id，回播时靠 url 直连，必须一起存进历史
      if (song.local) {
        entry.local = true
        entry.url = song.url
        entry.path = song.path
        entry.artist = song.artist || ''
      }

      this.items = [entry, ...this.items.filter((item) => item.id !== entry.id)].slice(0, 300)
    },
    clear() {
      this.items = []
    }
  },
  persist: {
    storage: localStorage,
    paths: ['items']
  }
})
