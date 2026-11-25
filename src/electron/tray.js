const path = require('path')
const { Tray, BrowserWindow, ipcMain, nativeTheme, screen } = require('electron')

const PLAYMODE_NAMES = ['顺序播放', '列表循环', '单曲循环', '随机播放']
const APP_NAME = 'Electron Music'
const MENU_W = 232
const MENU_H = 340

module.exports = function createTray(win, app, quitApp, lyric = {}) {
  // 托盘图标是单色徽标，随任务栏深浅色切换：深色任务栏用白徽标，浅色用黑徽标
  const iconFor = () =>
    path.resolve(
      __dirname,
      nativeTheme.shouldUseDarkColors
        ? '../assets/icon/tray-white.ico'
        : '../assets/icon/tray-black.ico'
    )

  const tray = new Tray(iconFor())
  tray.setToolTip(APP_NAME)

  const onThemeUpdated = () => tray.setImage(iconFor())
  nativeTheme.on('updated', onThemeUpdated)

  let playing = false
  let playMode = 0
  let currentSong = ''
  let menuWindow = null

  const send = (channel, ...args) => win.webContents.send(channel, ...args)

  const toggleWindow = () => {
    if (win.isVisible() && !win.isMinimized()) {
      win.hide()
    } else {
      win.show()
      win.focus()
    }
  }

  const lyricVisible = () => {
    const w = typeof lyric.getLyricWindow === 'function' ? lyric.getLyricWindow() : null
    return !!(w && !w.isDestroyed() && w.isVisible())
  }

  const pushState = () => {
    if (!menuWindow || menuWindow.isDestroyed()) return
    menuWindow.webContents.send('tray-menu-state', {
      playing,
      playMode,
      song: currentSong,
      desktopLyric: lyricVisible()
    })
  }

  const closeTrayMenu = () => {
    if (menuWindow && !menuWindow.isDestroyed()) menuWindow.close()
  }

  /** 自定义右键菜单：与应用同一套亚克力语言，替代系统原生菜单 */
  const showTrayMenu = () => {
    if (menuWindow && !menuWindow.isDestroyed()) {
      closeTrayMenu()
      return
    }

    const area = screen.getPrimaryDisplay().workArea
    const bounds = tray.getBounds() || {}
    let x = Number.isFinite(bounds.x)
      ? Math.round(bounds.x + (bounds.width || 16) / 2 - MENU_W / 2)
      : area.x + area.width - MENU_W - 12
    let y = Number.isFinite(bounds.y) ? Math.round(bounds.y - MENU_H - 6) : area.y + area.height - MENU_H - 12
    // 托盘在屏幕顶部时改到图标下方，并保证整扇菜单落在工作区内
    if (y < area.y) y = Math.round(bounds.y + (bounds.height || 16) + 6)
    x = Math.max(area.x + 4, Math.min(x, area.x + area.width - MENU_W - 4))
    y = Math.max(area.y + 4, Math.min(y, area.y + area.height - MENU_H - 4))

    menuWindow = new BrowserWindow({
      width: MENU_W,
      height: MENU_H,
      x,
      y,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      show: false,
      backgroundColor: '#00000000',
      webPreferences: {
        preload: path.resolve(__dirname, './tray-menu-preload.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    })

    menuWindow.loadFile(path.join(__dirname, './tray-menu.html'))
    menuWindow.once('ready-to-show', () => {
      if (!menuWindow || menuWindow.isDestroyed()) return
      menuWindow.show()
      pushState()
    })
    menuWindow.on('blur', closeTrayMenu)
    menuWindow.on('closed', () => { menuWindow = null })
  }

  tray.on('click', toggleWindow)
  tray.on('right-click', showTrayMenu)
  tray.setToolTip(currentSong ? `${APP_NAME} · ${currentSong}` : APP_NAME)

  ipcMain.on('music-playing-check', (e, isPlaying) => {
    playing = !!isPlaying
    pushState()
  })

  ipcMain.on('music-playmode-tray-change', (e, mode) => {
    playMode = Number(mode) || 0
    pushState()
  })

  // 当前曲目变化时更新菜单首行与 tooltip
  ipcMain.on('music-song-tray', (e, text) => {
    const next = String(text || '').slice(0, 48)
    if (next === currentSong) return
    currentSong = next
    tray.setToolTip(currentSong ? `${APP_NAME} · ${currentSong}` : APP_NAME)
    pushState()
  })

  ipcMain.on('tray-menu-ready', pushState)

  ipcMain.on('tray-menu-action', (e, action) => {
    switch (action) {
      case 'play': send('music-playing-control'); break
      case 'prev': send('music-song-control', 'last'); break
      case 'next': send('music-song-control', 'next'); break
      case 'mode': {
        playMode = (playMode + 1) % 4
        send('music-playmode-control', playMode)
        pushState()
        break
      }
      case 'window': toggleWindow(); break
      case 'lyric':
        if (typeof lyric.toggleDesktopLyric === 'function') lyric.toggleDesktopLyric()
        setTimeout(pushState, 60)
        break
      case 'quit': closeTrayMenu(); quitApp(); break
      default: break
    }
    if (action !== 'quit') closeTrayMenu()
  })

  app.on('before-quit', () => {
    closeTrayMenu()
    nativeTheme.removeListener('updated', onThemeUpdated)
    tray.destroy()
  })

  return tray
}
