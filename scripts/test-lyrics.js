/**
 * 歌词自动滚动回归测试
 * 断言：1) 歌词容器真的可滚动（clientHeight < scrollHeight）
 *       2) 播放进度推进时 scrollTop 跟着增长
 *       3) 中途打开播放页会直接定位到当前行
 */
const { app, BrowserWindow } = require('electron')
const path = require('path')

app.setPath('userData', path.join(__dirname, '..', '.shot-profile'))
app.disableHardwareAcceleration()

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const run = (win, code) => win.webContents.executeJavaScript(code, true)
const state = `(() => {
  const box = document.querySelector('.np__lyric-list')
  const active = box.querySelector('.line.is-active')
  return JSON.stringify({
    scrollTop: Math.round(box.scrollTop),
    clientH: box.clientHeight,
    scrollH: box.scrollHeight,
    idx: active ? [...box.querySelectorAll('.line')].indexOf(active) : -1
  })
})()`

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1280, height: 800, show: false, webPreferences: { offscreen: true } })
  await win.loadURL('http://localhost:5273/#/')
  await wait(2600)

  // 播到 2:30 再开播放页
  await run(win, `(() => {
    const p = window.__player
    p.songList = [{ id: 99, name: 'Lyric Scroll Test', al: { name: 'A' }, ar: [{ name: 'X' }], dt: 300000 }]
    p.currentIndex = 0; p.songId = 99; p.duration = 300; p.progress = 150; p.playing = true
    p.lyricLoading = false
    p.lyricLines = Array.from({ length: 50 }, (_, i) => ({ time: i * 5, text: '第 ' + (i + 1) + ' 行', trans: '' }))
  })()`)
  await wait(300)
  await run(win, `document.querySelector('.player__song')?.click()`)
  await wait(1200)

  const opened = JSON.parse(await run(win, state))
  console.log('打开时:', opened)
  const scrollable = opened.clientH < opened.scrollH
  const centeredOnOpen = opened.scrollTop > 0

  const steps = []
  for (const t of [60, 100, 140, 180, 220]) {
    await run(win, `window.__player.progress = ${t}`)
    await wait(650)
    steps.push(JSON.parse(await run(win, state)))
  }
  console.log('推进后:', steps.map((s) => `t${s.idx}/top${s.scrollTop}`).join('  '))

  const increasing = steps.every((s, i) => i === 0 || s.scrollTop >= steps[i - 1].scrollTop)
  const moved = steps[steps.length - 1].scrollTop > steps[0].scrollTop

  console.log('结果:', JSON.stringify({ scrollable, centeredOnOpen, increasing, moved }))
  app.quit()
})
