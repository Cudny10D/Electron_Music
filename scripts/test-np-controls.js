/**
 * 全屏播放器控件排布回归：
 *  - 播放模式按钮归到左侧组（喜欢 + 播放模式 / 下载 + 添加到歌单 各 2 个）
 *  - 三栏 minmax(0,1fr) auto minmax(0,1fr) 让「上一首/播放/下一首」严格居中
 *  - 在 1280x800（用户截图尺寸）、2560x1440（最大化）、1280x720（矮窗口）三种尺寸下
 *    量化中间组 / 大圆播放键相对控件区与封面中轴的偏差
 * 运行前需 npm run dev（5273）。
 */
const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')

app.setPath('userData', path.join(__dirname, '..', '.shot-profile'))
app.disableHardwareAcceleration()

const OUT = path.join(__dirname, '..', 'shots')
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const run = (w, c) => w.webContents.executeJavaScript(c, true)
const shot = async (w, name) => {
  const img = await w.webContents.capturePage()
  fs.writeFileSync(path.join(OUT, name), img.toPNG())
}

const SETUP = `(() => {
  const p = window.__player
  p.songList = [{ id: 1, name: '食虫植物', al: { name: 'NEW ROMANCER', picUrl: '' }, ar: [{ name: '理芽' }], dt: 218000 }]
  p.currentIndex = 0
  p.songId = 1
  p.duration = 218
  p.progress = 89
  p.playing = false
  p.lyricLoading = false
  p.lyricLines = Array.from({ length: 24 }, (_, i) => ({ time: i * 9, text: 'LYRIC LINE ' + (i + 1), trans: '' }))
  return true
})()`

async function openNp(win, theme) {
  await win.loadURL('http://localhost:5273/#/')
  await wait(2600)
  await run(win, SETUP)
  await run(win, `(() => { document.documentElement.dataset.theme = '${theme}'; return true })()`)
  await wait(300)
  await run(win, `(() => { document.querySelector('.player__song')?.click(); return true })()`)
  await wait(1100)
}

async function measure(win) {
  return JSON.parse(
    await run(
      win,
      `JSON.stringify((() => {
        const r = (s) => {
          const e = document.querySelector(s)
          if (!e) return null
          const b = e.getBoundingClientRect()
          return { left: b.left, width: b.width, center: b.left + b.width / 2 }
        }
        const c = r('.np__controls')
        const m = r('.np__controls-main')
        const p = r('.np__ctrl--main')
        const cover = r('.np__cover')
        const titles = (s) => [...document.querySelectorAll(s)].map((b) => b.title)
        return {
          open: !!document.querySelector('.np'),
          controls: c ? { left: Math.round(c.left), width: Math.round(c.width), center: +c.center.toFixed(1) } : null,
          main: m ? { center: +m.center.toFixed(1), width: Math.round(m.width) } : null,
          play: p ? { center: +p.center.toFixed(1) } : null,
          cover: cover ? { center: +cover.center.toFixed(1) } : null,
          delta: c && m ? +(m.center - c.center).toFixed(1) : null,
          playDelta: c && p ? +(p.center - c.center).toFixed(1) : null,
          coverDelta: cover && p ? +(p.center - cover.center).toFixed(1) : null,
          leftBtns: titles('.np__controls-side:not(.np__controls-side--end) button'),
          rightBtns: titles('.np__controls-side--end button')
        }
      })())`
    )
  )
}

app.whenReady().then(async () => {
  // 只加载一次页面，之后靠 setSize 切尺寸：重复 loadURL 容易撞上 Vite 热更新而 ERR_FAILED
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: { offscreen: true, webSecurity: false }
  })
  await openNp(win, 'light')

  const cases = [
    { w: 1280, h: 800, theme: 'light', shot: 'chk-np-controls.png' },
    { w: 2560, h: 1440, theme: 'light' },
    { w: 1280, h: 720, theme: 'dark', shot: 'chk-np-controls-dark.png' }
  ]
  let failed = 0

  for (const c of cases) {
    win.setSize(c.w, c.h)
    await run(win, `(() => { document.documentElement.dataset.theme = '${c.theme}'; return true })()`)
    await wait(650)
    const m = await measure(win)
    const centered = (v) => typeof v === 'number' && Math.abs(v) <= 1
    const balanced =
      m.leftBtns.length === 2 &&
      m.rightBtns.length === 2 &&
      m.leftBtns.some((t) => /播放|循环|随机/.test(t)) &&
      m.rightBtns.some((t) => /下载/.test(t))
    const ok = m.open && centered(m.delta) && centered(m.playDelta) && centered(m.coverDelta) && balanced
    console.log(`${c.w}x${c.h} ${c.theme}:`, JSON.stringify(m), ok ? 'OK' : 'FAIL')
    if (!ok) failed++
    if (c.shot) await shot(win, c.shot)
  }

  console.log(failed ? `FAILED ${failed}` : 'ALL OK')
  app.quit()
})
