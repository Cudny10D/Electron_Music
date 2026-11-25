const { globalShortcut, Menu } = require('electron')
const Store = require('electron-store')

// 全局快捷键统一带 Alt，避免占用系统的 Ctrl+方向键（原版默认绑定过于激进）
const SHORTCUTS = [
  { accelerator: 'CommandOrControl+Alt+P', channel: 'music-playing-control' },
  { accelerator: 'CommandOrControl+Alt+Left', channel: 'music-song-control', payload: 'last' },
  { accelerator: 'CommandOrControl+Alt+Right', channel: 'music-song-control', payload: 'next' },
  { accelerator: 'CommandOrControl+Alt+Up', channel: 'music-volume-up' },
  { accelerator: 'CommandOrControl+Alt+Down', channel: 'music-volume-down' },
  { accelerator: 'CommandOrControl+Alt+]', channel: 'music-process-control', payload: 'forward' },
  { accelerator: 'CommandOrControl+Alt+[', channel: 'music-process-control', payload: 'back' }
]

let fallbackHandler = null

function fire(win, channel, payload) {
  if (win.isDestroyed()) return
  // 第二个参数就是 player.js 回调里的 option/mode；以前多塞了一个 {}，
  // 渲染层拿到的永远是空对象，「上一首」被当成「下一首」。
  if (payload === undefined) win.webContents.send(channel)
  else win.webContents.send(channel, payload)
}

/** 把 Ctrl+Alt+P 这类组合解析成 before-input-event 可比对的结构 */
function matches(event, accelerator) {
  const parts = accelerator.toLowerCase().split('+')
  const key = parts[parts.length - 1]
  const needCtrl = parts.includes('commandorcontrol')
  const needAlt = parts.includes('alt')
  if (needCtrl !== !!(event.control || event.meta)) return false
  if (needAlt !== !!event.alt) return false
  const map = { left: 'left', right: 'right', up: 'up', down: 'down', ']': ']', '[': '[' }
  const expected = map[key] || key
  return (event.key || '').toLowerCase() === expected
}

module.exports = function registerShortcuts(win) {
  const settingsStore = new Store({ name: 'settings' })
  const settings = settingsStore.get('settings') || {}
  const enabled = settings?.other?.globalShortcuts !== false

  Menu.setApplicationMenu(null)
  globalShortcut.unregisterAll()
  if (fallbackHandler) {
    win.webContents.off('before-input-event', fallbackHandler)
    fallbackHandler = null
  }
  if (!enabled) return

  const failed = []
  SHORTCUTS.forEach(({ accelerator, channel, payload }) => {
    try {
      const ok = globalShortcut.register(accelerator, () => fire(win, channel, payload))
      if (!ok) failed.push({ accelerator, channel, payload })
    } catch (err) {
      failed.push({ accelerator, channel, payload })
    }
  })

  // 某些系统/安全软件会拦下全局热键注册；窗口内仍要能用快捷键
  if (failed.length) {
    fallbackHandler = (event, input) => {
      if (input.type !== 'keyDown') return
      for (const item of failed) {
        if (matches(input, item.accelerator)) {
          event.preventDefault()
          fire(win, item.channel, item.payload)
          return
        }
      }
    }
    win.webContents.on('before-input-event', fallbackHandler)
  }
}
