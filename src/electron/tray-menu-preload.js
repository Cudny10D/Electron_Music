const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('trayMenuApi', {
  // 主进程 -> 菜单：当前歌曲 / 播放状态 / 播放模式 / 桌面歌词状态
  onState: (callback) => ipcRenderer.on('tray-menu-state', (event, state) => callback(state)),
  // 菜单 -> 主进程：点击动作
  action: (name) => ipcRenderer.send('tray-menu-action', name),
  // 菜单打开时拉取一次最新状态
  ready: () => ipcRenderer.send('tray-menu-ready')
})
