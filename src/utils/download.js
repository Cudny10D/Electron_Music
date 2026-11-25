import { useDownloadStore } from '../store/downloadStore'

export { sanitizeFileName } from './downloadCore'

/** 单曲下载：加入队列（SongTable / NowPlaying 的调用点保持不变） */
export function downloadSong(song, quality) {
  return useDownloadStore().enqueue([song], quality)
}

/** 批量下载：详情页「下载全部」 */
export function downloadSongs(songs, quality) {
  return useDownloadStore().enqueue(songs, quality)
}
