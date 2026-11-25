const { app, BrowserWindow } = require('electron')

app.disableHardwareAcceleration()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const run = (win, code) => win.webContents.executeJavaScript(code, true)

app.whenReady().then(async () => {
  // 看门狗，避免异常时进程挂着不退出
  setTimeout(() => {
    console.log('watchdog exit')
    app.exit(0)
  }, 30000)

  const win = new BrowserWindow({ width: 1280, height: 800, show: false, webPreferences: { offscreen: true } })
  win.webContents.on('console-message', (event, level, message) => {
    if (level >= 2 && !message.includes('Security') && !message.includes('Feature flag')) console.log('[c]', message)
  })

  await win.loadURL('http://localhost:5273/#/playlist/3778678')
  await wait(6000)

  // 点第一首可播放的曲子（整行点击）
  const clicked = await run(
    win,
    `(() => {
      const rows = [...document.querySelectorAll('.track')];
      const row = rows.find(r => !r.classList.contains('is-locked'));
      if (!row) return 'none';
      const name = row.querySelector('.track__title')?.textContent?.trim();
      row.click();
      return name;
    })()`
  )
  console.log('clicked row:', clicked)

  await wait(6000)
  const state = await run(
    win,
    `JSON.stringify({
      songId: window.__player.songId,
      playing: window.__player.playing,
      duration: Math.round(window.__player.duration),
      lyricLines: window.__player.lyricLines.length,
      quality: window.__player.quality,
      toasts: [...document.querySelectorAll('.toast')].map(t => t.textContent.trim())
    })`
  )
  console.log('player:', state)

  // 返回按钮
  const before = await run(win, `location.hash`)
  await run(win, `document.querySelector('.back')?.click()`)
  await wait(1200)
  const after = await run(win, `location.hash`)
  console.log('back:', before, '->', after)

  app.quit()
})
