const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')

app.setPath('userData', require('path').join(__dirname, '..', '.shot-profile'))
app.disableHardwareAcceleration()

const OUT = path.join(__dirname, '..', 'shots')
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const run = (win, code) => win.webContents.executeJavaScript(code, true)

async function capture(win, name) {
  const image = await win.webContents.capturePage()
  fs.mkdirSync(OUT, { recursive: true })
  fs.writeFileSync(path.join(OUT, `${name}.png`), image.toPNG())
  console.log('captured', name)
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1280, height: 800, show: false, webPreferences: { offscreen: true } })
  win.webContents.on('console-message', (event, level, message) => {
    if (level >= 2) console.log('[renderer]', message)
  })

  await win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  await wait(6000)
  await capture(win, 'dist-home')

  await run(win, `location.hash = '#/my'`)
  await wait(2000)
  await capture(win, 'dist-my')

  app.quit()
})
