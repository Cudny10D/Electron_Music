const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')

app.disableHardwareAcceleration()
const OUT = path.join(__dirname, '..', 'shots')
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const run = (win, code) => win.webContents.executeJavaScript(code, true)

const FAKE = `(() => {
  const p = window.__player;
  p.songList = [{
    id: 9001,
    name: 'Operation Fake Waves',
    ar: [{ id: 1, name: '章玉宇 / Erik Castro' }],
    al: { id: 2, name: '危机合约 #11 原声带', picUrl: 'http://p4.music.126.net/TnaPKtQVBg_kT3OOpxtH0Q==/109951174269909108.jpg' },
    dt: 216000
  }];
  p.currentIndex = 0; p.songId = 9001; p.duration = 216; p.progress = 83; p.playing = true;
  p.lyricLines = [
    { time: 0, text: '作词 : David Lin', trans: '' },
    { time: 12, text: "This ain't for the weak links or the faint heart", trans: '这里容不下丝毫破绽 容不下懦夫' },
    { time: 24, text: 'The foes coming up ahead are bound to make a mark', trans: '前方迎面而来的敌人将留下伤痕' },
    { time: 36, text: 'On our faces they will be leaving scars', trans: '我们的面庞将留下伤疤' },
    { time: 48, text: 'On our graves here is what they are gonna carve', trans: '在我们的墓碑上 他们会刻下：' },
    { time: 60, text: '“We will be walking all over you and snuffing out your flames”', trans: '“我们将践踏你们 扑灭你们的火焰”' },
    { time: 72, text: 'We will be drowning out your voices and be crashing down like tidal', trans: '我们会淹没你们的呐喊 如潮水般倾泻而下' }
  ];
  p.lyricIndex = 4;
})()`

async function shot(win, name) {
  const img = await win.webContents.capturePage()
  fs.writeFileSync(path.join(OUT, `${name}.png`), img.toPNG())
  console.log('captured', name)
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1280, height: 820, show: false, webPreferences: { offscreen: true } })
  win.webContents.on('console-message', (event, level, message) => {
    if (level >= 2 && !message.includes('Security') && !message.includes('Feature flag')) console.log('[c]', message)
  })

  await win.loadURL('http://localhost:5273/#/')
  await wait(1500)

  // 写一份暗色设置再刷新
  await run(
    win,
    `localStorage.setItem('settingsStore', JSON.stringify({
      theme: 'dark', accent: '#8b9163', grid: true, uiScale: 100,
      lyricSize: 19, transSize: 12, showLyric: true, showTrans: true,
      quality: 'exhigh', startVolume: 70, startPlayMode: 1, seekLive: true,
      crossfade: true, hideCredits: false, downloadFolder: '', globalShortcuts: true,
      quitApp: 'minimize', rememberWindow: true
    }))`
  )
  await win.webContents.reload()
  await wait(5000)
  await shot(win, 'dark-home')

  await run(win, `location.hash = '#/settings'`)
  await wait(2000)
  await shot(win, 'dark-settings')

  // 设置搜索
  await run(
    win,
    `(() => {
      const input = document.querySelector('.settings__search input');
      input.value = '主题';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`
  )
  await wait(800)
  await shot(win, 'dark-settings-search')

  // 全屏播放器（注入播放状态）
  await run(win, `location.hash = '#/'`)
  await wait(1500)
  await run(win, FAKE)
  await wait(600)
  await run(win, `document.querySelector('.player__expand')?.click()`)
  await wait(1200)
  await shot(win, 'dark-nowplaying')

  app.quit()
})
