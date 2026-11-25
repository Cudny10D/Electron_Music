const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')

app.disableHardwareAcceleration()
const OUT = path.join(__dirname, '..', 'shots')
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

app.whenReady().then(async () => {
  const width = Number(process.env.SHOT_W || 1280)
  const height = Number(process.env.SHOT_H || 800)
  const hash = process.env.SHOT_HASH || '#/'
  const name = process.env.SHOT_NAME || 'one'

  const win = new BrowserWindow({ width, height, show: false, webPreferences: { offscreen: true } })
  win.webContents.on('console-message', (event, level, message) => {
    if (level >= 2 && !message.includes('Security') && !message.includes('Feature flag')) console.log('[c]', message)
  })

  await win.loadURL(`http://localhost:5273/${hash}`)
  await wait(Number(process.env.SHOT_WAIT || 5000))

  // 可选：滚动到指定选择器再截图（用于页面下方的评论区等）
  const scrollSel = process.env.SHOT_SCROLL_SEL
  if (scrollSel) {
    await win.webContents.executeJavaScript(
      `(() => { const el = document.querySelector(${JSON.stringify(scrollSel)}); if (el) el.scrollIntoView({ block: 'start' }); return !!el; })()`
    )
    await wait(Number(process.env.SHOT_SCROLL_WAIT || 1500))
  }

  const img = await win.webContents.capturePage()
  fs.writeFileSync(path.join(OUT, `${name}.png`), img.toPNG())
  console.log('captured', name, hash)
  app.quit()
})
