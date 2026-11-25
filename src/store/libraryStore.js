import { defineStore } from 'pinia'
import { getPlaylistDetail, getPlaylistAll, playlistDynamic } from '../api/playlist'
import { getAlbumDetail, albumDynamic } from '../api/album'
import { getArtistDetail, getArtistFansCount } from '../api/artist'
import { getSongDetail } from '../api/song'
import { mapSongsPlayableStatus } from '../utils/songStatus'

export const useLibraryStore = defineStore('libraryStore', {
  state: () => ({
    kind: null, // playlist | album | artist | likes
    info: null,
    songs: [],
    loading: false,
    error: null
  }),
  actions: {
    reset() {
      this.info = null
      this.songs = []
      this.error = null
    },

    async loadPlaylist(id) {
      this.loading = true
      this.kind = 'playlist'
      this.error = null
      try {
        const params = { id, limit: 1000, offset: 0 }
        const [detail, all, dynamic] = await Promise.all([
          getPlaylistDetail(params),
          getPlaylistAll(params),
          playlistDynamic(id).catch(() => ({ subscribed: false }))
        ])
        const playlist = detail.playlist
        playlist.followed = dynamic?.subscribed ?? false

        let songs = mapSongsPlayableStatus(all.songs, all.privileges) || []
        const total = playlist.trackIds?.length || 0
        for (let offset = 1000; offset < total; offset += 1000) {
          const page = await getPlaylistAll({ id, limit: 1000, offset })
          songs = songs.concat(mapSongsPlayableStatus(page.songs, page.privileges) || [])
        }

        this.info = playlist
        this.songs = songs
      } catch (err) {
        this.error = '歌单加载失败，请检查网易云 API 是否在 36530 端口运行'
      } finally {
        this.loading = false
      }
    },

    async loadAlbum(id) {
      this.loading = true
      this.kind = 'album'
      this.error = null
      try {
        const [detail, dynamic] = await Promise.all([
          getAlbumDetail({ id }),
          albumDynamic(id).catch(() => ({ isSub: false }))
        ])
        const album = detail.album
        album.followed = dynamic?.isSub ?? false
        this.info = album
        this.songs = mapSongsPlayableStatus(detail.songs) || []
      } catch (err) {
        this.error = '专辑加载失败'
      } finally {
        this.loading = false
      }
    },

    async loadArtist(id) {
      this.loading = true
      this.kind = 'artist'
      this.error = null
      try {
        const [detail, fans] = await Promise.all([
          getArtistDetail({ id }),
          getArtistFansCount(id).catch(() => null)
        ])
        const artist = detail.artist
        artist.followed = fans?.data?.follow ?? false
        artist.fansCount = fans?.data?.fansCnt ?? null
        this.info = artist
        this.songs = mapSongsPlayableStatus(detail.hotSongs) || []
      } catch (err) {
        this.error = '歌手加载失败'
      } finally {
        this.loading = false
      }
    },

    async loadLikes(ids) {
      this.loading = true
      this.kind = 'likes'
      this.error = null
      try {
        this.info = {
          id: 'likes',
          name: '我喜欢的音乐',
          coverImgUrl: null,
          creator: { nickname: '我' },
          trackCount: ids.length
        }
        if (!ids.length) {
          this.songs = []
          return
        }
        const chunks = []
        for (let i = 0; i < ids.length; i += 500) chunks.push(ids.slice(i, i + 500))
        const results = await Promise.all(chunks.map((chunk) => getSongDetail(chunk)))
        this.songs = results.flatMap((r) => mapSongsPlayableStatus(r.songs) || [])
      } catch (err) {
        this.error = '喜欢的音乐加载失败'
      } finally {
        this.loading = false
      }
    }
  }
})
