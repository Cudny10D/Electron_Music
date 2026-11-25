import { defineStore } from 'pinia'
import { getRecommendedSongList } from '../api/playlist'
import { getNewestSong } from '../api/song'
import { getRecommendSongs } from '../api/playlist'
import { mapSongsPlayableStatus } from '../utils/songStatus'

/** /personalized/newsong 返回的是旧版结构（song.artists / song.album / duration），统一成新版字段 */
function normalizeNewSongs(result = []) {
  return result.map((item) => {
    const song = item.song || item
    const album = song.album || song.al || {}
    return {
      id: song.id,
      name: song.name || item.name,
      ar: (song.artists || song.ar || []).map((artist) => ({ id: artist.id, name: artist.name })),
      al: {
        id: album.id,
        name: album.name,
        picUrl: album.picUrl || album.blurPicUrl || item.picUrl
      },
      dt: song.duration || song.dt || 0,
      fee: song.fee,
      privilege: song.privilege
    }
  })
}

export const useHomeStore = defineStore('homeStore', {
  state: () => ({
    recommended: [],
    newSongs: [],
    daily: [],
    loading: false,
    error: null
  }),
  actions: {
    async loadHome() {
      this.loading = true
      this.error = null
      try {
        const [recommended, newest] = await Promise.all([
          getRecommendedSongList(12),
          getNewestSong()
        ])
        this.recommended = recommended.result || []
        this.newSongs = mapSongsPlayableStatus(normalizeNewSongs(newest.result)) || []
      } catch (err) {
        this.error = '无法连接网易云 API（localhost:36530），请确认服务已启动'
      } finally {
        this.loading = false
      }
    },

    async loadDaily() {
      try {
        const res = await getRecommendSongs()
        this.daily = mapSongsPlayableStatus(res.data?.dailySongs) || []
      } catch (err) {
        this.daily = []
      }
    }
  }
})
