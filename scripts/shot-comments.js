/**
 * 评论区可视化回归：
 *  - 歌单详情页底部评论面板（真实接口数据）
 *  - 全屏播放器切到「评论」视图（当前歌曲评论）
 * 运行前需 npm run dev（5273）。
 */
const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')

app.disableHardwareAcceleration()
const OUT = path.join(__dirname, '..', 'shots')
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const run = (w, c) => w.webContents.executeJavaScript(c, true)
const shot = async (w, name) => {
  fs.writeFileSync(path.join(OUT, name), (await w.webContents.capturePage()).toPNG())
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1280, height: 800, show: false, webPreferences: { offscreen: true, webSecurity: false } })
  win.webContents.on('console-message', (e, level, msg) => {
    if (level >= 2 && !msg.includes('Security') && !msg.includes('Feature flag')) console.log('[c]', msg)
  })

  // 1) 歌单详情页评论区
  await win.loadURL('http://localhost:5273/#/playlist/18450594421')
  await wait(9000)
  await run(win, `(() => { const el = document.querySelector('.comments'); if (el) el.scrollIntoView({ block: 'start' }); return true })()`)
  await wait(2500)
  await shot(win, 'chk-comments-detail.png')
  console.log('captured detail')

  // 2) 全屏播放器评论视图：注入一首真实在线歌曲后打开全屏，再点「评论」
  await win.loadURL('http://localhost:5273/#/')
  await wait(2600)
  await run(win, `(() => {
    const p = window.__player
    const song = { id: 3443432381, name: '食虫植物', al: { name: 'NEW ROMANCER', picUrl: 'http://p1.music.126.net/placeholder/1.jpg' }, ar: [{ name: '理芽' }], dt: 218000 }
    p.songList = [song]
    p.currentIndex = 0
    p.songId = song.id
    p.duration = 218
    p.progress = 89
    p.playing = false
    p.lyricLoading = false
    return true
  })()`)
  await wait(400)
  await run(win, `(() => { document.querySelector('.player__song')?.click(); return true })()`)
  await wait(1200)
  const opened = await run(win, `!!document.querySelector('.np')`)
  console.log('np opened:', opened)
  await run(win, `(() => {
    const btn = [...document.querySelectorAll('.np__toggle button')].find(b => b.textContent.includes('评论'))
    if (btn) btn.click()
    return !!btn
  })()`)
  await wait(6000)
  await shot(win, 'chk-comments-player.png')
  console.log('captured player')

  app.quit()
})
