const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('desktopLyricApi', {
  // 主窗口 -> 歌词窗：歌曲名 / 歌词行 / 当前索引 / 主题
  onData: (callback) => ipcRenderer.on('desktop-lyric-data', (event, data) => callback(data)),
  // 鼠标穿透开关（锁定时开启；靠近解锁把手时由歌词页临时关闭）
  setLocked: (passthrough) => ipcRenderer.send('desktop-lyric-locked', passthrough),
  // 关闭歌词窗
  close: () => ipcRenderer.send('desktop-lyric-close'),
  // 打开时请求主窗口推一次当前状态
  ready: () => ipcRenderer.send('desktop-lyric-ready')
})
