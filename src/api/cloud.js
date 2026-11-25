import request from '../utils/request'

/** 我的云盘歌曲列表（分页） */
export function getUserCloud(params) {
  return request({
    url: '/user/cloud',
    method: 'get',
    params
  })
}

/** 云盘歌曲详情：ids 为数组或逗号分隔字符串 */
export function getUserCloudDetail(ids) {
  return request({
    url: '/user/cloud/detail',
    method: 'get',
    params: { id: Array.isArray(ids) ? ids.join(',') : ids }
  })
}

/** 全站云搜（type: 1 单曲 / 10 专辑 / 100 歌手 / 1000 歌单） */
export function cloudSearch(params) {
  return request({
    url: '/cloudsearch',
    method: 'get',
    params
  })
}

/** 从云盘删除歌曲 */
export function deleteUserCloud(id) {
  return request({
    url: '/user/cloud/del',
    method: 'post',
    params: { id }
  })
}

/** 上传音乐文件到云盘（multipart） */
export function uploadCloud(file) {
  const form = new FormData()
  form.append('songFile', file)
  return request({
    url: '/cloud',
    method: 'post',
    data: form,
    timeout: 120000
  })
}
