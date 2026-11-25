/** 暗色主题下的「我的音乐」两栏布局截图（假 API 注入，保证有内容） */
const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')
const registerIpc = require('../src/electron/ipcMain')
const ROOT = path.join(__dirname, '..')
const OUT = path.join(ROOT, 'shots')
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const run = (win, code) => win.webContents.executeJavaScript(code, true)

const UID = 12231591030
const FAKE = {
  playlists: [
    { id: 3778678, name: '氷雨_Hisame喜欢的音乐', specialType: 5, creator: { userId: UID, nickname: '氷雨_Hisame' }, trackCount: 5, coverImgUrl: '', createTime: 1720291200000 },
    { id: 9001, name: '【流行】夏日甜筒 This Summer', creator: { userId: UID, nickname: '氷雨_Hisame' }, trackCount: 57, coverImgUrl: '', createTime: 1720291200000 },
    { id: 9002, name: '饮冰室合集', creator: { userId: UID, nickname: '氷雨_Hisame' }, trackCount: 36, coverImgUrl: '', createTime: 1720291200000 },
    { id: 9003, name: '别人的精选集', creator: { userId: 777, nickname: '网易云' }, trackCount: 20, coverImgUrl: '', createTime: 1720291200000 }
  ],
  songs: [
    { id: 11, name: 'Color Your Night', ar: [{ id: 1, name: 'Lotus Juice' }], al: { id: 1, name: 'PERSONA' }, dt: 227000 },
    { id: 12, name: 'BATTLEPLAN ARCLIGHT', ar: [{ id: 2, name: '塞壬唱片-MSR' }], al: { id: 1, name: 'PERSONA' }, dt: 224000 },
    { id: 13, name: 'Speed of Light', ar: [{ id: 3, name: '塞壬唱片-MSR' }], al: { id: 1, name: 'PERSONA' }, dt: 245000 },
    { id: 14, name: 'にっこり^^調査隊のテーマ', ar: [{ id: 4, name: 'ワンダーランズ' }], al: { id: 1, name: 'PERSONA' }, dt: 206000 },
    { id: 15, name: '小悪魔だってかまわない!', ar: [{ id: 5, name: '叶' }], al: { id: 1, name: 'PERSONA' }, dt: 209000 }
  ]
}

app.setPath('userData', path.join(ROOT, '.probe-profile'))
app.disableHardwareAcceleration()

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1440,
    height: 940,
    show: false,
    webPreferences: {
      offscreen: true,
      preload: path.join(ROOT, 'src/electron/preload.js'),
      contextIsolation: true,
      webSecurity: false
    }
  })
  registerIpc(win, app, () => app.quit())
  await win.loadURL('http://localhost:5273/#/my')
  await wait(2200)

  await run(win, `(async () => {
    const req = (await import('/src/utils/request.js')).default
    window.__FAKE = ${JSON.stringify(FAKE)}
    req.defaults.adapter = (config) => {
      const url = String(config.url || ''), f = window.__FAKE
      let data = { code: 200 }
      if (url.includes('/user/playlist')) data = { playlist: f.playlists }
      else if (url.includes('/playlist/detail')) data = { playlist: f.playlists.find(p => String(p.id) === String(config.params?.id)) || f.playlists[1] }
      else if (url.includes('/playlist/track/all')) data = { songs: f.songs, privileges: [] }
      else if (url.includes('/song/detail')) data = { songs: f.songs }
      return Promise.resolve({ data, status: 200, statusText: 'OK', headers: {}, config })
    }
    return true
  })()`)
  await run(win, `(() => {
    document.documentElement.dataset.theme = 'dark'
    const u = window.__pinia._s.get('userStore')
    u.user = { userId: ${UID}, nickname: '氷雨_Hisame', avatarUrl: '' }
    u.likelist = [11, 12, 13]
    return true
  })()`)
  await wait(350)
  await run(win, `document.querySelector('.library__refresh')?.click()`)
  await wait(900)
  console.log('dark rows:', await run(win, `JSON.stringify({ rows: document.querySelectorAll('.library__row').length, fake: window.__FAKE?.playlists?.length })`))
  await run(win, `document.querySelectorAll('.library__row')[1]?.click()`)
  await wait(800)
  let img = await win.webContents.capturePage()
  fs.writeFileSync(path.join(OUT, 'chk-my-dark.png'), img.toPNG())

  await win.loadURL('http://localhost:5273/#/my?tab=local')
  await wait(1400)
  await run(win, `document.documentElement.dataset.theme = 'dark'`)
  await wait(500)
  img = await win.webContents.capturePage()
  fs.writeFileSync(path.join(OUT, 'chk-my-dark-local.png'), img.toPNG())

  console.log('dark shots captured')
  app.quit()
}).catch((e) => { console.error(e); app.exit(1) })
