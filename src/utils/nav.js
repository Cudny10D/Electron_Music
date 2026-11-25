/** 统一的「返回上一页」：没有历史栈时回首页，避免把窗口退出去 */
export function goBack(router, fallback = '/') {
  const state = router.options.history.state
  if (state && state.back) router.back()
  else router.push(fallback)
}
