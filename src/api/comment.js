import request from '../utils/request'

/**
 * 评论资源类型（对应 NeteaseCloudMusicApi 的 resourceTypeMap）
 * 0 歌曲 / 2 歌单 / 3 专辑 / 4 电台 / 5 视频
 */
export const COMMENT_TYPE = {
  SONG: 0,
  PLAYLIST: 2,
  ALBUM: 3
}

/** 排序：99 推荐 / 2 热度 / 3 时间 */
export const COMMENT_SORT = {
  RECOMMEND: 99,
  HOT: 2,
  TIME: 3
}

/**
 * 获取评论列表（新版接口，支持推荐/热度/时间排序与分页）
 * @param {object} params { type, id, pageNo, pageSize, sortType, cursor }
 * 返回 data: { comments, totalCount, hasMore, cursor, sortTypeList }
 */
export function getComments(params) {
  return request({
    url: '/comment/new',
    method: 'get',
    params: {
      pageNo: 1,
      pageSize: 20,
      sortType: COMMENT_SORT.RECOMMEND,
      ...params
    }
  })
}

/**
 * 发表评论 / 回复 / 删除
 * t: 1 发表 2 回复 0 删除
 * 删除或回复时需传 commentId（回复的目标评论 id）
 */
export function postComment({ type, id, content, t = 1, commentId }) {
  return request({
    url: '/comment',
    method: 'post',
    params: {
      type,
      id,
      t,
      content,
      ...(commentId ? { commentId } : {})
    }
  })
}

/**
 * 点赞 / 取消点赞评论
 * t: 1 点赞 0 取消
 */
export function likeComment({ type, id, cid, t = 1 }) {
  return request({
    url: '/comment/like',
    method: 'get',
    params: { type, id, cid, t }
  })
}
