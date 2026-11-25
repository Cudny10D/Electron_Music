const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')

app.disableHardwareAcceleration()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const run = (win, code) => win.webContents.executeJavaScript(code, true)

const registerIpc = require('../src/electron/ipcMain')

app.whenReady().then(async () => {
  setTimeout(() => {
    console.log('watchdog exit')
    app.exit(0)
  }, 90000)

  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'src', 'electron', 'preload.js'),
      webSecurity: false,
      offscreen: true
    }
  })

  registerIpc(win, app, () => app.quit())

  win.webContents.on('console-message', (event, level, message) => {
    if (level >= 2 && !message.includes('Security') && !message.includes('Feature flag')) console.log('[c]', message)
  })

  await win.loadURL('http://localhost:5273/#/playlist/3778678')
  await wait(6000)

  const hasApi = await run(win, `typeof window.windowApi?.downloadSong === 'function'`)
  console.log('preload downloadSong exposed:', hasApi)

  const dir = await run(win, `window.windowApi.getDownloadDir()`)
  console.log('download dir:', dir)

  await run(
    win,
    `(() => {
      const row = [...document.querySelectorAll('.track')].find(r => !r.classList.contains('is-locked'));
      row?.querySelector('.track__act-btn[title="下载"]')?.click();
    })()`
  )

  await wait(15000)
  const toasts = await run(win, `[...document.querySelectorAll('.toast')].map(t => t.textContent.trim())`)
  console.log('toasts:', JSON.stringify(toasts))

  try {
    const files = fs.readdirSync(dir)
    console.log('files in dir:', files.slice(0, 5), '| count:', files.length)
    if (files[0]) {
      const stat = fs.statSync(path.join(dir, files[0]))
      console.log('first file size:', Math.round(stat.size / 1024), 'KB')
    }
  } catch (err) {
    console.log('dir read error:', err.message)
  }

  app.quit()
})
