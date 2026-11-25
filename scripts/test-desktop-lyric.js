/**
 * 桌面歌词回归：通过主窗口 renderer 的 windowApi 打开浮窗并推一次模拟歌词，
 * 然后截取桌面歌词窗口，验证亚克力 / 居中当前行 / 主题。
 */
const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')

app.disableHardwareAcceleration()
const OUT = path.join(__dirname, '..', 'shots')
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

app.whenReady().then(async () => {
  // 模拟一个歌词浮窗：直接复用真实页面 + 真实 preload，手动推数据
  const win = new BrowserWindow({
    width: 620, height: 170, x: 260, y: 200,
    frame: false, transparent: true, alwaysOnTop: true,
    skipTaskbar: true, show: false,
    webPreferences: {
      preload: path.resolve(__dirname, '../src/electron/desktop-lyric-preload.js'),
      contextIsolation: true, nodeIntegration: false
    }
  })
  await win.loadFile(path.join(__dirname, '../src/electron/desktop-lyric.html'))
  await wait(600)
  win.show()

  const push = (light) => win.webContents.send('desktop-lyric-data', {
    songName: '食虫植物 · 理芽',
    light,
    index: 1,
    lines: [
      { text: '前一行歌词示例', time: 10 },
      { text: '这是当前正在唱的歌词行', time: 20 },
      { text: '下一行歌词示例', time: 30 }
    ]
  })

  push(false)
  await wait(1200)
  fs.writeFileSync(path.join(OUT, 'chk-desktop-lyric-dark.png'), (await win.webContents.capturePage()).toPNG())
  console.log('captured dark')

  push(true)
  await wait(600)
  fs.writeFileSync(path.join(OUT, 'chk-desktop-lyric-light.png'), (await win.webContents.capturePage()).toPNG())
  console.log('captured light')

  app.quit()
})
