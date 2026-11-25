/** 验证单曲下载按钮 / 详情页「下载全部」都正确入队（注入列表数据，避免依赖真实 API） */
const { app, BrowserWindow } = require('electron')
const path = require('path')
app.setPath('userData', path.join(__dirname, '..', '.shot-profile'))
app.disableHardwareAcceleration()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const run = (win, code) => win.webContents.executeJavaScript(code, true)

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1280, height: 820, show: false, webPreferences: { offscreen: true } })
  await win.loadURL('http://localhost:5273/#/playlist/3778678')
  await wait(2500)

  const songs = [
    { id: 501, name: '注入歌曲 A', ar: [{ id: 1, name: '歌手 A' }], al: { name: '专辑 A' }, dt: 200000 },
    { id: 502, name: '注入歌曲 B', ar: [{ id: 2, name: '歌手 B' }], al: { name: '专辑 B' }, dt: 210000 },
    { id: 503, name: '注入歌曲 C', ar: [{ id: 3, name: '歌手 C' }], al: { name: '专辑 C' }, dt: 220000 }
  ]

  // 让详情页渲染出 SongTable 与操作按钮；把队列的 runTask 停掉，只看入队结果
  await run(win, `(() => {
    const lib = window.__pinia._s.get('libraryStore')
    lib.info = { id: 3778678, name: '测试歌单', trackCount: 3, coverImgUrl: '' }
    lib.songs = ${JSON.stringify(songs)}
    lib.loading = false
    lib.error = ''
    const d = window.__download
    d.tasks = []
    d.runTask = async (task) => { task.status = 'fetching' }
  })()`)
  await wait(400)
  console.log('rendered:', await run(win, `JSON.stringify({ rows: document.querySelectorAll('.track').length, hasBatch: !![...document.querySelectorAll('.head__actions .hb-btn')].find(b => b.textContent.includes('下载全部')) })`))

  // 单曲：SongTable 行的下载按钮（走 utils/download.downloadSong）
  const single = await run(win, `(() => {
    const btn = document.querySelector('.track .track__act-btn[title="下载"]')
    if (!btn) return 'no-button'
    btn.click()
    return 'clicked'
  })()`)
  await wait(200)
  console.log('single click:', single, await run(win, `JSON.stringify({ tasks: window.__download.tasks.length, name: window.__download.tasks[0]?.name })`))

  // 批量：详情页「下载全部」
  const batch = await run(win, `(() => {
    const btn = [...document.querySelectorAll('.head__actions .hb-btn')].find(b => b.textContent.includes('下载全部'))
    if (!btn) return 'no-button'
    btn.click()
    return 'clicked'
  })()`)
  await wait(300)
  console.log('batch click:', batch, await run(win, `JSON.stringify({ total: window.__download.tasks.length, panel: window.__ui.downloadsOpen })`))

  // 去重：同一首重复入队不应增加任务数（先让现有任务都非 busy：清掉再测）
  console.log('dedup:', await run(win, `(() => {
    const d = window.__download
    d.tasks = []
    d.enqueue([{ id: 601, name: 'dup', ar: [] }], 'exhigh', { openPanel: false })
    const before = d.tasks.length
    d.enqueue([{ id: 601, name: 'dup again', ar: [] }], 'exhigh', { openPanel: false })
    return JSON.stringify({ before, after: d.tasks.length })
  })()`))

  app.quit()
}).catch((e) => { console.error(e); app.exit(1) })
