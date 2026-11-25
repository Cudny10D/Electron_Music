import request from "../utils/request";

/**
 * 获取推荐歌单
 * @param {number} num 
 */
export function getRecommendedSongList(num) {
    return request({
        url: '/personalized',
        method: 'get',
        params: {
            limit: num
        }
    })
}

export function getTopList() {
    return request({
      url: '/toplist',
      method: 'get',
      params: {

      }
    });
}

/**
 * 获取歌单详情
 * 说明 : 歌单能看到歌单名字, 但看不到具体歌单内容 , 调用此接口 , 传入歌单 id, 
 * 可以获取对应歌单内的所有的音乐(未登录状态只能获取不完整的歌单,登录后是完整的)，
 * 但是返回的 trackIds 是完整的，tracks 则是不完整的，可拿全部 trackIds 请求一次 song/detail 
 * 接口获取所有歌曲的详情 (https://github.com/Binaryify/NeteaseCloudMusicApi/issues/452)
 * @returns 
 */
export function getPlaylistDetail(params) {
    return request({
      url: '/playlist/detail',
      method: 'get',
      params,
    });
}

/**
 * 说明 : 由于网易云接口限制，歌单详情只会提供 10 首歌，通过调用此接口，传入对应的歌单id，即可获得对应的所有歌曲
 * 必选参数 : id : 歌单 id
 * 可选参数 : limit : 限制获取歌曲的数量，默认值为当前歌单的歌曲数量
 * 可选参数 : offset : 默认值为0
 * @param {*} params 
 * @returns 
 */
export function getPlaylistAll(params) {
    return request({
      url: '/playlist/track/all',
      method: 'get',
      params,
    });
}

/**
 * 调用此接口 , 可获得每日推荐歌曲 ( 需要登录 )
 * @returns 
 */
export function getRecommendSongs(params) {
    return request({
      url: '/recommend/songs',
      method: 'get',
      params: {
        
      },
    });
}

/**
 * 说明 : 调用此接口 , 传入类型和歌单 id 可收藏歌单或者取消收藏歌单
 * 必选参数 :
 * t : 类型,1:收藏,2:取消收藏 id : 歌单 id
 * @param {*} params 
 * @returns 
 */
export function subPlaylist(params) {
    return request({
      url: '/playlist/subscribe',
      method: 'get',
      params,
    });
}

/**
 * 说明 : 调用后可获取歌单详情动态部分,如评论数,是否收藏,播放数
 * 必选参数 : id : 歌单 id
 * @param {*} params 
 * @returns 
 */
export function playlistDynamic(id) {
    return request({
      url: '/playlist/detail/dynamic',
      method: 'get',
      params: {
        id: id,
        timestamp: new Date().getTime(),
      }
    });
}

/**
 * 说明 : 调用此接口 , 传入歌单名字可新建歌单
 * 必选参数 : name : 歌单名
 * 可选参数 :
 * privacy : 是否设置为隐私歌单，默认否，传'10'则设置成隐私歌单
 * type : 歌单类型,默认'NORMAL',传 'VIDEO'则为视频歌单,传 'SHARED'则为共享歌单
 * @param {*} params 
 * @returns 
 */
export function createPlaylist(params) {
  return request({
    url: '/playlist/create',
    method: 'post',
    params,
  });
}

/**
 * 必选参数 :
 * op: 从歌单增加单曲为 add, 删除为 del
 * pid: 歌单 id tracks: 歌曲 id,可多个,用逗号隔开
 * @param {*} params 
 * @returns 
 */
export function updatePlaylist(params) {
    return request({
      url: '/playlist/tracks',
      method: 'post',
      params,
    });
}

/**
 * 说明 : 调用此接口 , 传入歌单 id 可删除歌单
 * 必选参数 : id : 歌单 id,可多个,用逗号隔开
 * @param {*} params 
 * @returns 
 */
export function deletePlaylist(params) {
    return request({
      url: '/playlist/delete',
      method: 'post',
      params,
    });
}

/** 编辑歌单：名称 / 简介 / 标签（batch 一次提交） */
export function updatePlaylistInfo(params) {
  return request({
    url: '/playlist/update',
    method: 'post',
    params,
  });
}

/** 单独改歌单名（batch 失败时的兜底） */
export function updatePlaylistName(params) {
  return request({
    url: '/playlist/name/update',
    method: 'post',
    params,
  });
}

/** 单独改歌单简介 */
export function updatePlaylistDesc(params) {
  return request({
    url: '/playlist/desc/update',
    method: 'post',
    params,
  });
}

/**
 * 更新歌单封面。
 * 该接口要求 multipart/form-data 的 imgFile，不能用普通 request（会走 params 序列化），
 * 所以这里单独用 fetch 提交 FormData，cookie 仍按项目约定放在 query 上。
 */
export async function updatePlaylistCover({ id, name, mime, dataUrl }, cookieParam) {
  const blob = await (await fetch(dataUrl)).blob()
  const form = new FormData()
  form.append('imgFile', new File([blob], name || 'cover.jpg', { type: mime || 'image/jpeg' }))
  const query = new URLSearchParams({ id: String(id) })
  if (cookieParam) query.set('cookie', cookieParam)
  const res = await fetch(`http://localhost:36530/playlist/cover/update?${query.toString()}`, {
    method: 'POST',
    body: form
  })
  return res.json()
}