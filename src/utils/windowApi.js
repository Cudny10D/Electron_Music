const native = typeof window !== 'undefined' ? window.windowApi : null

const shim = {
  windowMin() {},
  windowMax() {},
  windowClose() {},
  onWindowMaximized() {},
  setWindowTitle() {},
  getSettings: async () => ({ music: { level: 'exhigh' }, other: { quitApp: 'minimize', globalShortcuts: true } }),
  setSettings() {},
  getLastPlaylist: async () => {
    try {
      return JSON.parse(localStorage.getItem('hydrogen:lastPlaylist') || 'null')
    } catch (err) {
      return null
    }
  },
  saveLastPlaylist: (playlist) => localStorage.setItem('hydrogen:lastPlaylist', JSON.stringify(playlist)),
  beforeQuit() {},
  exitApp() {},
  playOrPauseMusic() {},
  lastOrNextMusic() {},
  changeMusicPlaymode() {},
  volumeUp() {},
  volumeDown() {},
  musicProcessControl() {},
  playOrPauseMusicCheck() {},
  changeTrayMusicPlaymode() {},
  setTraySong() {},
  copyTxt: (text) => navigator.clipboard?.writeText(text),
  quitApp() {},

  // 下载：纯浏览器里没有主进程，直接给出可读的提示
  downloadSong: async () => ({ ok: false, error: '浏览器环境不支持下载，请在桌面端使用' }),
  cancelDownload() {},
  onDownloadProgress() {},
  chooseDownloadDir: async () => null,
  getDownloadDir: async () => '',
  openDir: async () => '',
  revealFile() {},
  chooseImage: async () => null,
  // 浏览器环境没有主进程文件系统：返回空结果，UI 会显示「请在桌面端使用」
  pickLocalFolders: async () => [],
  scanLocalFolders: async () => [],
  pickCoverImage: async () => null,
  // 桌面歌词：浏览器里只提示，不真正开窗
  toggleDesktopLyric: async () => false,
  updateDesktopLyric() {},
  onDesktopLyricRequestState() {}
}

export const isDesktop = !!native
export default native || shim
