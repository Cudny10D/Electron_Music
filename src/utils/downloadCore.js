import { getMusicUrl, getMusicUrlLegacy } from '../api/song'

export function sanitizeFileName(name) {
  return String(name)
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
}

/** v1 常被风控，失败后回退旧接口 */
export async function resolveStreamUrl(songId, level) {
  try {
    const res = await getMusicUrl(songId, level)
    const url = res?.data?.[0]?.url
    if (url) return url
  } catch (err) {
    // 继续试旧接口
  }
  try {
    const legacy = await getMusicUrlLegacy(songId, level)
    return legacy?.data?.[0]?.url || null
  } catch (err) {
    return null
  }
}

export function buildFileName(song) {
  const artist = (song.ar || song.artists || []).map((a) => a.name).join(',')
  return `${sanitizeFileName(`${song.name || 'track'} - ${artist}`)}.mp3`
}
