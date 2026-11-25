import { defineStore } from 'pinia'
import { search } from '../api/other'
import { mapSongsPlayableStatus } from '../utils/songStatus'

export const useSearchStore = defineStore('searchStore', {
  state: () => ({
    keyword: '',
    songs: [],
    playlists: [],
    artists: [],
    albums: [],
    loading: false,
    error: null,
    tab: 'songs',
    recents: []
  }),
  actions: {
    async searchAll(keyword) {
      const word = (keyword || '').trim()
      if (!word) return
      this.keyword = word
      this.recents = [word, ...this.recents.filter((item) => item !== word)].slice(0, 8)
      this.loading = true
      this.error = null
      this.songs = []
      this.playlists = []
      this.artists = []
      this.albums = []

      const tasks = [
        { type: 1, limit: 50, apply: (d) => (this.songs = mapSongsPlayableStatus(d.result?.songs) || []) },
        { type: 1000, limit: 24, apply: (d) => (this.playlists = d.result?.playlists || []) },
        { type: 100, limit: 12, apply: (d) => (this.artists = d.result?.artists || []) },
        { type: 10, limit: 24, apply: (d) => (this.albums = d.result?.albums || []) }
      ]

      try {
        await Promise.all(
          tasks.map((task) =>
            search({ keywords: word, type: task.type, limit: task.limit })
              .then(task.apply)
              .catch(() => {})
          )
        )
        if (!this.songs.length && !this.playlists.length && !this.albums.length && !this.artists.length) {
          this.error = '没有找到相关结果'
        }
      } catch (err) {
        this.error = '搜索失败，请确认 API 服务可用'
      } finally {
        this.loading = false
      }
    },
    clearRecents() {
      this.recents = []
    }
  },
  persist: {
    storage: localStorage,
    paths: ['recents']
  }
})
