const { app, BrowserWindow } = require('electron')

app.disableHardwareAcceleration()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const run = (win, code) => win.webContents.executeJavaScript(code, true)

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1280, height: 820, show: false, webPreferences: { offscreen: true } })
  win.webContents.on('console-message', (event, level, message) => {
    if (level >= 2 && !message.includes('Security') && !message.includes('Feature flag')) console.log('[c]', message)
  })

  await win.loadURL('http://localhost:5273/#/settings')
  await wait(4000)

  const before = await run(win, `getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()`)

  // 点第 2 个色板（靛蓝）
  await run(win, `document.querySelectorAll('.swatch')[1].click()`)
  await wait(400)
  const afterAccent = await run(win, `getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()`)

  // 点音质「无损」
  await run(win, `[...document.querySelectorAll('.seg button')].find(b => b.textContent.trim() === '无损').click()`)
  await wait(400)
  const quality = await run(win, `JSON.stringify({ store: window.__player.quality, saved: JSON.parse(localStorage.getItem('settingsStore') || '{}').quality })`)

  // 歌词字号拉到 24
  await run(win, `(() => { const r = document.querySelectorAll('.range')[0]; r.value = 24; r.dispatchEvent(new Event('input', { bubbles: true })); })()`)
  await wait(300)
  const lyric = await run(win, `getComputedStyle(document.documentElement).getPropertyValue('--lyric-size').trim()`)

  // 网格切纯色
  await run(win, `[...document.querySelectorAll('.seg button')].find(b => b.textContent.trim() === '纯色').click()`)
  await wait(300)
  const plain = await run(win, `document.getElementById('app').classList.contains('is-plain')`)

  console.log('accent before/after:', before, '->', afterAccent)
  console.log('quality:', quality)
  console.log('lyric-size:', lyric)
  console.log('plain bg:', plain)

  app.quit()
})
