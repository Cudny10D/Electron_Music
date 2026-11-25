const { app, BrowserWindow } = require('electron')
const path = require('path')
app.setPath('userData', path.join(__dirname, '..', '.shot-profile'))
app.disableHardwareAcceleration()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const run = (w, c) => w.webContents.executeJavaScript(c, true)

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 2560, height: 1440, show: false, webPreferences: { offscreen: true } })
  await win.loadURL('http://localhost:5273/#/')
  await wait(3200)
  await run(win, `(() => {
    const p = window.__player
    p.songList = [{ id: 1, name: 'A', al: { name: 'Alb', picUrl: 'https://p1.music.126.net/Wl7T1LBRhZFg0O26ttVCMA==/109951162905989296.jpg' }, ar: [{ name: 'X' }], dt: 300000 }]
    p.currentIndex = 0; p.songId = 1; p.duration = 300; p.progress = 60; p.playing = true
    p.lyricLoading = false
    p.lyricLines = Array.from({ length: 60 }, (_, i) => ({ time: i * 5, text: '第 ' + (i + 1) + ' 行', trans: '' }))
  })()`)
  await wait(400)
  await run(win, `document.querySelector('.player__song')?.click()`)
  await wait(1200)

  console.log('layout:', await run(win, `JSON.stringify((() => {
    const box = (s) => { const el = document.querySelector(s); if (!el) return null; const r = el.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.width)] }
    return { vw: innerWidth, top: box('.np__top'), body: box('.np__body'), cover: box('.np__cover'), lyrics: box('.np__lyrics'), coverVar: getComputedStyle(document.querySelector('.np')).getPropertyValue('--np-cover') }
  })())`))

  // 歌词滚动采样
  await run(win, `(() => {
    const box = document.querySelector('.np__lyric-list')
    window.__s = []
    const t0 = performance.now()
    const loop = () => {
      window.__s.push([Math.round(performance.now() - t0), Math.round(box.scrollTop)])
      if (performance.now() - t0 < 900) requestAnimationFrame(loop)
    }
    window.__player.progress = 140
    requestAnimationFrame(loop)
  })()`)
  await wait(1100)
  console.log('scroll:', await run(win, `JSON.stringify(window.__s.filter((_, i) => i % 6 === 0).slice(0, 12))`))

  // 换歌：背景与封面过渡
  await run(win, `(() => {
    const p = window.__player
    p.songList = [{ id: 2, name: 'B', al: { name: 'Alb2', picUrl: 'https://p2.music.126.net/8PqZ8pM0n0h5c0j1F7yY8g==/109951166000000001.jpg' }, ar: [{ name: 'Y' }], dt: 200000 }]
    p.currentIndex = 0; p.songId = 2
  })()`)
  await wait(220)
  console.log('switch@220:', await run(win, `JSON.stringify({
    bgs: [...document.querySelectorAll('.np__bg')].map((e) => +(+getComputedStyle(e).opacity).toFixed(2)),
    imgs: document.querySelectorAll('.np__cover img').length,
    miniImgs: document.querySelectorAll('.player__cover img').length
  })`))
  await wait(1200)
  console.log('switch@1.4s:', await run(win, `JSON.stringify({
    bgs: document.querySelectorAll('.np__bg').length,
    imgs: document.querySelectorAll('.np__cover img').length,
    miniImgs: document.querySelectorAll('.player__cover img').length
  })`))
  app.quit()
})
