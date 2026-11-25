const { app, BrowserWindow } = require('electron')

app.disableHardwareAcceleration()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const run = (win, code) => win.webContents.executeJavaScript(code, true)

app.whenReady().then(async () => {
  setTimeout(() => {
    console.log('watchdog exit')
    app.exit(0)
  }, 60000)

  const win = new BrowserWindow({ width: 1280, height: 820, show: false, webPreferences: { offscreen: true } })
  win.webContents.on('console-message', (event, level, message) => {
    if (level >= 2 && !message.includes('Security') && !message.includes('Feature flag')) console.log('[c]', message)
  })

  await win.loadURL('http://localhost:5273/#/playlist/3778678')
  await wait(6000)

  // 1. 播放一首 → 历史应有一条
  await run(
    win,
    `(() => {
      const row = [...document.querySelectorAll('.track')].find(r => !r.classList.contains('is-locked'));
      row?.click();
    })()`
  )
  await wait(6000)
  const playState = await run(win, `JSON.stringify({ playing: window.__player.playing, duration: Math.round(window.__player.duration) })`)
  console.log('play:', playState)

  // 2. 历史页
  await run(win, `location.hash = '#/history'`)
  await wait(2500)
  const historyInfo = await run(
    win,
    `JSON.stringify({ rows: document.querySelectorAll('.track').length, title: document.querySelector('.history__title')?.textContent })`
  )
  console.log('history:', historyInfo)

  // 3. 下载第一首
  const before = await run(win, `document.querySelectorAll('.track__act-btn').length`)
  await run(
    win,
    `(() => {
      const row = document.querySelector('.track');
      const btns = [...row.querySelectorAll('.track__act-btn')];
      const btn = btns.find(b => b.title === '下载');
      btn?.click();
    })()`
  )
  await wait(12000)
  const toasts = await run(win, `[...document.querySelectorAll('.toast')].map(t => t.textContent.trim())`)
  console.log('download toasts:', JSON.stringify(toasts), '| action buttons per row:', before)

  // 4. 设置里拖动色相 → accent 变化
  await run(win, `location.hash = '#/settings'`)
  await wait(2000)
  const accentBefore = await run(win, `getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()`)
  await run(
    win,
    `(() => {
      const r = document.querySelectorAll('.hsl .range')[0];
      r.value = 200;
      r.dispatchEvent(new Event('input', { bubbles: true }));
    })()`
  )
  await wait(500)
  const accentAfter = await run(win, `getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()`)
  console.log('accent:', accentBefore, '->', accentAfter)

  app.quit()
})
