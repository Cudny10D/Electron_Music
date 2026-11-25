import { defineStore } from 'pinia'

export const usePlayerStore = defineStore('playerStore', {
  state: () => ({
    // 列表
    songList: [],
    listInfo: null, // { id, kind: 'playlist' | 'album' | 'artist' | 'likes' | 'search' }
    currentIndex: -1,
    songId: null,

    // 播放状态
    playing: false,
    loading: false,
    progress: 0,
    duration: 0,
    volume: 0.7,
    playMode: 1, // 0 顺序 1 列表循环 2 单曲循环 3 随机
    quality: 'exhigh',

    // 随机
    shuffledList: [],
    shuffleIndex: 0,

    // 歌词
    lyric: null,
    lyricLines: [],
    lyricIndex: -1,
    lyricLoading: false
  }),
  getters: {
    currentSong: (state) => state.songList[state.currentIndex] || null,
    hasList: (state) => state.songList.length > 0
  },
  persist: {
    storage: localStorage,
    paths: ['volume', 'playMode', 'quality']
  }
})
