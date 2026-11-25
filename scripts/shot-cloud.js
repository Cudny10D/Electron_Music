/** 云盘 Hydrogen 双栏布局截图（假 API 注入，保证有内容） */
const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')
const registerIpc = require('../src/electron/ipcMain')
const ROOT = path.join(__dirname, '..')
const OUT = path.join(ROOT, 'shots')
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const run = (win, code) => win.webContents.executeJavaScript(code, true)

const UID = 12231591030
const CLOUDS = [
  { songId: 100, songName: 'Execution.m4a', artist: 'Unknown', album: 'Execution', addTime: 1746875475000, fileSize: 1363148, simpleSong: { id: 100, name: 'Execution.m4a', size: 1363148, ar: [{ name: 'Unknown' }], al: { name: 'Execution' } } },
  { songId: 101, songName: 'lllllifted.wav', artist: 'Unknown', album: 'lllllifted', addTime: 1736598316000, fileSize: 10780000, simpleSong: { id: 101, name: 'lllllifted.wav', size: 10780000, ar: [{ name: 'Unknown' }], al: { name: 'lllllifted' } } }
]

app.setPath('userData', path.join(ROOT, '.probe-profile-cloud'))
app.disableHardwareAcceleration()

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1024,
    height: 700,
    show: false,
    webPreferences: {
      offscreen: true,
      preload: path.join(ROOT, 'src/electron/preload.js'),
      contextIsolation: true,
      webSecurity: false
    }
  })
  registerIpc(win, app, () => app.quit())
  await win.loadURL('http://localhost:5273/#/cloud')
  await wait(2200)

  await run(win, `(async () => {
    const req = (await import('/src/utils/request.js')).default
    window.__FAKE = { clouds: ${JSON.stringify(CLOUDS)} }
    req.defaults.adapter = (config) => {
      const url = String(config.url || '')
      let data = { code: 200 }
      if (url.includes('/user/cloud') && !url.includes('/del')) data = { code: 200, count: 2, size: 11384832, maxSize: 64424509440, data: window.__FAKE.clouds }
      return Promise.resolve({ data, status: 200, statusText: 'OK', headers: {}, config })
    }
    return true
  })()`)
  await run(win, `(() => {
    document.documentElement.dataset.theme = 'dark'
    const u = window.__pinia._s.get('userStore')
    u.user = { userId: ${UID}, nickname: '氷雨_Hisame', avatarUrl: '' }
    return true
  })()`)
  await wait(350)
  // 重新进页面，onMounted 时 user 已登录且 adapter 已注入
  await win.loadURL('http://localhost:5273/#/cloud')
  await wait(2400)
  await run(win, `(async () => {
    const req = (await import('/src/utils/request.js')).default
    window.__FAKE = { clouds: ${JSON.stringify(CLOUDS)} }
    req.defaults.adapter = (config) => {
      const url = String(config.url || '')
      let data = { code: 200 }
      if (url.includes('/user/cloud') && !url.includes('/del')) data = { code: 200, count: 2, size: 11384832, maxSize: 64424509440, data: window.__FAKE.clouds }
      return Promise.resolve({ data, status: 200, statusText: 'OK', headers: {}, config })
    }
    document.documentElement.dataset.theme = 'dark'
    return true
  })()`)
  await wait(200)
  await run(win, `document.querySelector('.disk-refresh')?.click()`)
  await wait(1200)

  console.log('cloud rows:', await run(win, `JSON.stringify({ rows: document.querySelectorAll('.list-item').length, cats: document.querySelectorAll('.type').length })`))
  let img = await win.webContents.capturePage()
  fs.writeFileSync(path.join(OUT, 'chk-cloud-dark.png'), img.toPNG())

  // 亮色
  await run(win, `document.documentElement.dataset.theme = 'light'`)
  await wait(400)
  img = await win.webContents.capturePage()
  fs.writeFileSync(path.join(OUT, 'chk-cloud-light.png'), img.toPNG())

  console.log('cloud shots captured')
  app.quit()
}).catch((e) => { console.error(e); app.exit(1) })
