const { contextBridge, ipcRenderer } = require('electron')

const listen = (channel) => (callback) => ipcRenderer.on(channel, callback)

contextBridge.exposeInMainWorld('windowApi', {
  // 窗口
  windowMin: () => ipcRenderer.send('window-min'),
  windowMax: () => ipcRenderer.send('window-max'),
  windowClose: () => ipcRenderer.send('window-close'),
  onWindowMaximized: listen('window-maximized'),
  setWindowTitle: (title) => ipcRenderer.send('set-window-title', title),

  // 设置
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSettings: (settings) => ipcRenderer.send('set-settings', settings),

  // 播放列表持久化
  getLastPlaylist: () => ipcRenderer.invoke('get-last-playlist'),
  saveLastPlaylist: (playlist) => ipcRenderer.send('save-last-playlist', playlist),
  beforeQuit: listen('player-save'),
  exitApp: (playlist) => ipcRenderer.send('exit-app', playlist),

  // 托盘 / 全局快捷键 -> 渲染进程
  playOrPauseMusic: listen('music-playing-control'),
  lastOrNextMusic: listen('music-song-control'),
  changeMusicPlaymode: listen('music-playmode-control'),
  volumeUp: listen('music-volume-up'),
  volumeDown: listen('music-volume-down'),
  musicProcessControl: listen('music-process-control'),

  // 渲染进程 -> 托盘状态
  playOrPauseMusicCheck: (playing) => ipcRenderer.send('music-playing-check', playing),
  changeTrayMusicPlaymode: (mode) => ipcRenderer.send('music-playmode-tray-change', mode),
  setTraySong: (text) => ipcRenderer.send('music-song-tray', text),

  copyTxt: (txt) => ipcRenderer.send('copy-txt', txt),
  quitApp: () => ipcRenderer.send('app-quit'),

  // 下载
  downloadSong: (payload) => ipcRenderer.invoke('download-song', payload),
  cancelDownload: (taskId) => ipcRenderer.send('download-cancel', taskId),
  onDownloadProgress: listen('download-progress'),
  chooseDownloadDir: () => ipcRenderer.invoke('choose-download-dir'),
  getDownloadDir: () => ipcRenderer.invoke('get-download-dir'),
  openDir: (dir) => ipcRenderer.invoke('open-dir', dir),
  revealFile: (filePath) => ipcRenderer.invoke('reveal-file', filePath),

  // 自定义背景
  chooseImage: () => ipcRenderer.invoke('choose-image'),

  // 本地音乐 / 歌单封面
  pickLocalFolders: () => ipcRenderer.invoke('local-pick-folders'),
  scanLocalFolders: (dirs, opts) => ipcRenderer.invoke('local-scan', dirs, opts),
  pickCoverImage: () => ipcRenderer.invoke('pick-cover-image'),

  // 桌面歌词
  toggleDesktopLyric: () => ipcRenderer.invoke('desktop-lyric-toggle'),
  updateDesktopLyric: (data) => ipcRenderer.send('desktop-lyric-update', data),
  onDesktopLyricRequestState: (callback) => ipcRenderer.on('desktop-lyric-request-state', callback)
})
