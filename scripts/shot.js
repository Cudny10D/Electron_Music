const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')

app.setPath('userData', require('path').join(__dirname, '..', '.shot-profile'))
app.disableHardwareAcceleration()

const BASE = 'http://localhost:5273'
const OUT = path.join(__dirname, '..', 'shots')

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const run = (win, code) => win.webContents.executeJavaScript(code, true)

const LYRICS = [
  ['作词 : David Lin', ''],
  ['作曲 : Erik Castro', ''],
  ["This ain't for the weak links or the faint heart", '这里容不下丝毫破绽 容不下懦夫'],
  ['The foes coming up ahead are bound to make a mark', '前方迎面而来的敌人将留下伤痕'],
  ['On our faces they will be leaving scars', '我们的面庞将留下伤疤'],
  ['On our graves here is what they are gonna carve', '在我们的墓碑上 他们会刻下：'],
  ['“We will be walking all over you and snuffing out your flames”', '“我们将践踏你们 扑灭你们的火焰”'],
  ['We will be drowning out your voices and be crashing down like tidal', '我们会淹没你们的呐喊 如潮水般倾泻而下']
]

const FAKE_STATE = `
(() => {
  const p = window.__player;
  p.songList = [{
    id: 9001,
    name: 'Operation Fake Waves',
    ar: [{ id: 1, name: '章玉宇 / Erik Castro' }],
    al: { id: 2, name: '危机合约 #11 原声带', picUrl: 'http://p4.music.126.net/TnaPKtQVBg_kT3OOpxtH0Q==/109951174269909108.jpg' },
    dt: 216000
  }];
  p.currentIndex = 0;
  p.songId = 9001;
  p.duration = 216;
  p.progress = 83;
  p.playing = true;
  p.lyricLines = ${JSON.stringify(LYRICS.map(([text, trans], i) => ({ time: i * 12, text, trans })))};
  p.lyricIndex = 6;
})()
`

async function capture(win, name) {
  const image = await win.webContents.capturePage()
  fs.mkdirSync(OUT, { recursive: true })
  fs.writeFileSync(path.join(OUT, `${name}.png`), image.toPNG())
  console.log('captured', name)
}

const STEPS = [
  { name: '01-home', hash: '#/', delay: 6000 },
  { name: '02-search', hash: '#/search?keywords=周杰伦', delay: 5000 },
  { name: '03-playlist', hash: '#/playlist/3778678', delay: 5000 },
  {
    name: '04-nowplaying',
    hash: '#/',
    delay: 1500,
    script: async (win) => {
      await run(win, FAKE_STATE)
      await wait(600)
      await run(win, `document.querySelector('.player__expand')?.click()`)
      await wait(1500)
    }
  },
  {
    name: '06-queue',
    hash: '#/playlist/3778678',
    delay: 4000,
    script: async (win) => {
      await run(win, `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
      await wait(500)
      await run(win, `[...document.querySelectorAll('.ctrl')].find(b => b.title === '播放队列')?.click()`)
      await wait(900)
    }
  },
  { name: '05-my', hash: '#/my', delay: 2500, esc: true },
  { name: '07-login', hash: '#/login', delay: 4000, esc: true },
  { name: '08-settings', hash: '#/settings', delay: 3000, esc: true }
]

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1280, height: 800, show: false, webPreferences: { offscreen: true } })
  win.webContents.setFrameRate(30)
  win.webContents.on('console-message', (event, level, message) => {
    if (level >= 2 && !message.includes('Security') && !message.includes('Feature flag')) {
      console.log('[renderer]', message)
    }
  })

  await win.loadURL(`${BASE}${STEPS[0].hash}`)
  // 截图统一用默认浅色主题（独立 profile 里可能残留测试设置）
  await run(win, `window.__settings?.update({ theme: 'light', customBg: '', bgMode: 'grid' })`)
  await wait(600)
  await wait(STEPS[0].delay)
  await capture(win, STEPS[0].name)

  for (const step of STEPS.slice(1)) {
    if (step.esc) {
      await run(win, `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
      await wait(400)
    }
    await run(win, `location.hash = ${JSON.stringify(step.hash)}`)
    await wait(step.delay)
    if (step.script) await step.script(win)
    await capture(win, step.name)
  }

  app.quit()
})
