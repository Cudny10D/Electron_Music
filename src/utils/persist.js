/** store id -> 需要落盘的字段 */
const PATHS = {
  settingsStore: [
    'accent',
    'theme',
    'customBg',
    'grid',
    'uiScale',
    'lowPerformance',
    'quality',
    'startVolume',
    'startPlayMode',
    'seekLive',
    'crossfade',
    'lyricSize',
    'transSize',
    'showLyric',
    'showTrans',
    'showRoma',
    'hideCredits',
    'downloadFolder',
    'globalShortcuts',
    'quitApp',
    'rememberWindow'
  ],
  playerStore: ['volume', 'playMode', 'quality'],
  userStore: ['user', 'accounts'],
  historyStore: ['items'],
  searchStore: ['recents'],
  localStore: ['folders', 'includeDownloads']
}

/**
 * 显式挂载 localStorage 持久化。
 * 不用 pinia 插件是因为 player.js 在模块加载期就创建了 5 个 store，
 * 插件注册晚于创建，那几个 store 从来没被持久化过。
 */
export function attachPersist(store, paths = PATHS[store.$id]) {
  const key = store.$id

  const snapshot = (state) => {
    if (!paths) return { ...state }
    return paths.reduce((acc, path) => {
      acc[path] = state[path]
      return acc
    }, {})
  }

  try {
    const raw = localStorage.getItem(key)
    if (raw) store.$patch(JSON.parse(raw))
  } catch (err) {
    // 数据损坏就用默认值
  }

  store.$subscribe(
    (mutation, state) => {
      try {
        localStorage.setItem(key, JSON.stringify(snapshot(state)))
      } catch (err) {
        // 配额不足时忽略
      }
    },
    { detached: true, flush: 'sync' }
  )

  try {
    localStorage.setItem(key, JSON.stringify(snapshot(store.$state)))
  } catch (err) {
    // 忽略
  }

  return store
}
