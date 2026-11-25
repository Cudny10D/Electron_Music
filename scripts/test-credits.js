const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')

app.setPath('userData', path.join(__dirname, '..', '.shot-profile'))
app.disableHardwareAcceleration()

const OUT = path.join(__dirname, '..', 'shots')
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const run = (win, code) => win.webContents.executeJavaScript(code, true)

async function shot(win, name) {
  const img = await win.webContents.capturePage()
  fs.writeFileSync(path.join(OUT, `${name}.png`), img.toPNG())
  console.log('captured', name)
}

// 真实世界的一屏“制作名单”歌词（来自用户截图那首）
const CREDITS = [
  '作曲：Remi Gallego',
  '编曲：Remi Gallego',
  '制作人：Remi Gallego',
  'Guitar：Remi Gallego',
  '录音：Remi Gallego',
  '混音：Remi Gallego',
  '母带：Remi Gallego',
  '音乐设计/监制：MSR Studio',
  '吉他 Guitar：宫崎 大介/动点/MSR Studio',
  '鼓手：蒋之珏'
]

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    show: false,
    webPreferences: { offscreen: true }
  })
  win.webContents.on('console-message', (e, level, message) => {
    if (level >= 2 && !/Security|Feature flag/.test(message)) console.log('[renderer]', message)
  })

  await win.loadURL('http://localhost:5273/#/settings')
  await wait(2800)

  // 暗色
  await run(win, `window.__settings.update({ theme: 'dark' })`)
  await wait(600)

  // 真实点击「隐藏制作人员信息 -> 开」
  const clicked = await run(
    win,
    `(() => {
      const row = [...document.querySelectorAll('.row')].find((el) => el.textContent.includes('隐藏制作人员信息'))
      if (!row) return 'row-not-found'
      const btn = [...row.querySelectorAll('button')].find((b) => b.textContent.trim() === '开')
      if (!btn) return 'button-not-found'
      btn.click()
      return 'clicked'
    })()`
  )
  await wait(600)
  const flag = await run(win, `JSON.stringify({ hideCredits: window.__settings.hideCredits })`)
  console.log('toggle:', clicked, flag)
  await shot(win, 'chk-dark-settings')

  // 聚焦设置页搜索框（暗色）
  await run(win, `document.querySelector('.settings__search input, .settings input[type=text]')?.focus()`)
  await wait(400)
  await shot(win, 'chk-dark-settings-search')

  // 注入歌词并打开全屏播放器
  await run(
    win,
    `(() => {
      const p = window.__player
      p.songList = [{
        id: 1901371647,
        name: 'Kernel Overflow',
        al: { name: 'REGULAMENTO', picUrl: 'http://p4.music.126.net/TnaPKtQVBg_kT3OOpxtH0Q==/109951174269909108.jpg' },
        ar: [{ name: 'MSR' }],
        dt: 158000
      }]
      p.currentIndex = 0
      p.songId = 1901371647
      p.duration = 158
      p.progress = 96
      p.playing = true
      p.lyricLoading = false
      p.lyricLines = ${JSON.stringify(CREDITS)}.map((text, i) => ({ time: i * 6, text, trans: '' }))
    })()`
  )
  await wait(500)
  await run(win, `document.querySelector('.player__song')?.click()`)
  await wait(1000)

  const result = await run(
    win,
    `JSON.stringify({
      shown: [...document.querySelectorAll('.np__lyric-list .line__text')].map((el) => el.textContent),
      count: document.querySelector('.np__lyric-head .hb-mute, .np__lyric-head span:last-child')?.textContent
    })`
  )
  console.log('lyrics after filter:', result)
  await shot(win, 'chk-dark-np')

  app.quit()
})
