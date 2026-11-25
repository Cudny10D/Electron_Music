import pinia from './store/pinia'
import api from './utils/windowApi'
import { isLogin } from './utils/authority'
import { usePlayerStore } from './store/playerStore'
import { useUserStore } from './store/userStore'
import { useSettingsStore } from './store/settingsStore'
import { useHistoryStore } from './store/historyStore'
import { useSearchStore } from './store/searchStore'
import { useDownloadStore } from './store/downloadStore'
import { useLocalStore } from './store/localStore'
import { attachPersist } from './utils/persist'
import { initPlayerBridge, restoreLast } from './utils/player'
import { getLikelist, getUserProfile } from './api/user'

export async function bootstrap() {
  const player = usePlayerStore(pinia)
  const user = useUserStore(pinia)
  const settings = useSettingsStore(pinia)
  const history = useHistoryStore(pinia)
  const search = useSearchStore(pinia)
  const downloads = useDownloadStore(pinia)
  const local = useLocalStore(pinia)

  // 先恢复本地持久化，再让主进程的设置覆盖
  attachPersist(settings)
  attachPersist(player)
  attachPersist(user)
  attachPersist(history)
  attachPersist(search)
  attachPersist(local)

  // 主进程的字节进度 -> 队列 store（shim 里是空实现，浏览器环境不会报错）
  api.onDownloadProgress((event, payload) => downloads.onProgress(payload))
  // 下载任务是运行时状态，不落盘；并发数始终跟随设置（启动时 + 设置页改动时）
  downloads.setConcurrency(settings.downloadConcurrency)
  settings.$subscribe(
    (mutation, state) => downloads.setConcurrency(state.downloadConcurrency),
    { detached: true }
  )

  try {
    const remote = await api.getSettings()
    settings.hydrate(remote)
  } catch (err) {
    settings.apply()
  }

  // 音质 / 启动音量 / 启动播放模式都以设置为准
  player.quality = settings.quality
  player.volume = Math.min(1, Math.max(0, settings.startVolume / 100))
  player.playMode = settings.startPlayMode

  // 跟随系统深浅色
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener?.('change', () => settings.apply())
  }

  initPlayerBridge()
  await restoreLast()

  if (isLogin()) {
    try {
      const profile = await getUserProfile()
      user.setUser(profile.profile)
      const likes = await getLikelist(profile.profile.userId)
      user.setLikelist(likes.ids || [])
    } catch (err) {
      // 登录态失效时保持游客状态
    }
  }
}
