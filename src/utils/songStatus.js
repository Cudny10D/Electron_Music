import { isLogin } from "./authority"

/**
 * 判断一首歌在客户端的“可点击”状态。
 *
 * VIP / 会员权益只有服务端（带 cookie 的取流接口）才知道，客户端不据此拦截播放。
 * 这里只拦确定不可播的情况：无版权、付费专辑未购买、已下架（登录后才可信）。
 * fee === 1（VIP 歌曲）只打标记，仍允许尝试播放——否则会出现
 * “登录了会员还是点不动”的情况：列表在登录前加载，playable 被永久写成 false。
 */
function checkSongPlayable(song, _privilege) {
  const privilege = _privilege ?? song?.privilege
  const fee = privilege?.fee ?? song?.fee
  const status = { playable: true, reason: '', vipOnly: false }

  // 已购 / 已授权（pl > 0）
  if (privilege?.pl > 0) return status

  if (fee === 1) {
    status.vipOnly = true
    return status
  }

  if (fee === 4 && (privilege?.st ?? song?.st) < 0) {
    status.playable = false
    status.reason = '付费专辑'
    return status
  }

  if (song?.noCopyrightRcmd !== null && song?.noCopyrightRcmd !== undefined) {
    status.playable = false
    status.reason = '无版权'
    return status
  }

  // 下架判断只在登录后可信，未登录时仍让用户试一次
  if ((privilege?.st ?? song?.st) < 0 && isLogin()) {
    status.playable = false
    status.reason = '已下架'
  }

  return status
}

// 只有调用 getPlaylistAll 接口时，才需传入 privileges 数组
export function mapSongsPlayableStatus(songs, privilegeList = []) {
  if (songs?.length === undefined) return

  if (privilegeList.length === 0) {
    return songs.map((song) => {
      Object.assign(song, checkSongPlayable(song))
      return song
    })
  }

  return songs.map((song, i) => {
    Object.assign(song, checkSongPlayable(song, privilegeList[i]))
    return song
  })
}
