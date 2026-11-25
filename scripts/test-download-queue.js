/**
 * 端到端验证批量下载队列。
 * 起一个本地「假网易云 API + 慢速音频流」，把整条链路跑通：
 *   store.enqueue -> resolveStreamUrl -> 主进程 download-song -> 进度事件 -> store.onProgress -> UI
 * 同时验证：并发上限、完成落盘、中途取消（半成品删除）、失败重试、清除。
 */
const { app, BrowserWindow } = require('electron')
const http = require('http')
const path = require('path')
const fs = require('fs')

app.setPath('userData', path.join(__dirname, '..', '.shot-profile'))
app.disableHardwareAcceleration()

const API_PORT = 36530
const TEST_DIR = path.join(__dirname, '..', 'shots', '.dl-test')
const CHUNK = 20 * 1024
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const run = (win, code) => win.webContents.executeJavaScript(code, true)
const registerIpc = require('../src/electron/ipcMain')

fs.rmSync(TEST_DIR, { recursive: true, force: true })
fs.mkdirSync(TEST_DIR, { recursive: true })

// 慢速音频流：分块延时发送，带 content-length，让进度事件可采样
function serveAudio(res, { chunks, delay }) {
  res.writeHead(200, {
    'Content-Type': 'audio/mpeg',
    'Content-Length': String(chunks * CHUNK)
  })
  let i = 0
  const tick = () => {
    if (i >= chunks) return res.end()
    res.write(Buffer.alloc(CHUNK, 65 + (i % 26)))
    i++
    setTimeout(tick, delay)
  }
  tick()
}

let retryIdCalls = 0 // id=888 前两次返回空 url，之后返回真 url，用于验证「重试能救活」
const server = http.createServer((req, res) => {
  const u = new URL(req.url, `http://127.0.0.1:${API_PORT}`)
  // 首页等其它接口给个空的 200，避免测试页飘红字
  if (!['/song/url/v1', '/song/url', '/audio'].includes(u.pathname)) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({ code: 200, result: [], data: [] }))
  }
  if (u.pathname === '/song/url/v1' || u.pathname === '/song/url') {
    const id = u.searchParams.get('id') || '0'
    let url
    if (id === '999') {
      url = null // 永远失败
    } else if (id === '888') {
      retryIdCalls++
      url = retryIdCalls > 2 ? `http://127.0.0.1:${API_PORT}/audio?id=${id}` : null
    } else {
      const mode = id === '777' ? 'cancel' : 'normal'
      url = `http://127.0.0.1:${API_PORT}/audio?mode=${mode}&id=${id}`
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({ data: [{ url }] }))
  }
  if (u.pathname === '/audio') {
    const mode = u.searchParams.get('mode')
    if (mode === 'cancel') return serveAudio(res, { chunks: 40, delay: 150 })
    return serveAudio(res, { chunks: 10, delay: 130 })
  }
  res.writeHead(404)
  res.end()
})

app.whenReady().then(async () => {
  const timeout = setTimeout(() => { console.log('WATCHDOG'); app.exit(1) }, 120000)
  await new Promise((resolve) => server.listen(API_PORT, '127.0.0.1', resolve))
  console.log('fake api on', API_PORT)

  const win = new BrowserWindow({
    width: 1440, height: 900, show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'src', 'electron', 'preload.js'),
      webSecurity: false, offscreen: true, contextIsolation: true
    }
  })
  registerIpc(win, app, () => app.quit())
  win.webContents.on('console-message', (e, level, msg) => {
    if (level >= 2 && !msg.includes('Security') && !msg.includes('Feature flag')) console.log('[console]', msg)
  })

  await win.loadURL('http://localhost:5273/#/history')
  await wait(3500)

  console.log('bridge:', await run(win, `JSON.stringify({
    store: !!window.__download,
    settings: !!window.__settings,
    progressListener: typeof window.windowApi.onDownloadProgress,
    cancel: typeof window.windowApi.cancelDownload
  })`))

  // 固定下载目录 + 并发 2
  await run(win, `(() => {
    window.__settings.update({ downloadFolder: ${JSON.stringify(TEST_DIR)}, downloadConcurrency: 2 })
  })()`)
  await wait(200)

  // ---- 1. 批量入队 3 首，验证并发上限 ----
  await run(win, `(() => {
    const d = window.__download
    d.tasks = []
    window.__prog = []
    d.enqueue([
      { id: 101, name: '歌曲 A', ar: [{ name: '歌手 A' }] },
      { id: 102, name: '歌曲 B', ar: [{ name: '歌手 B' }] },
      { id: 103, name: '歌曲 C', ar: [{ name: '歌手 C' }] }
    ], 'exhigh', { openPanel: true })
  })()`)
  await wait(350)
  console.log('after enqueue:', await run(win, `JSON.stringify({
    total: window.__download.tasks.length,
    active: window.__download.activeCount,
    queued: window.__download.queuedCount,
    concurrency: window.__download.concurrency,
    statuses: window.__download.tasks.map(t => t.status),
    panelOpen: window.__ui.downloadsOpen
  })`))

  // 中途采样进度（进度事件 -> store.onProgress）
  await wait(600)
  console.log('progress mid:', await run(win, `JSON.stringify(window.__download.tasks.map(t => ({ id: t.songId, pct: t.progress, status: t.status, loaded: t.loaded, total: t.total })))`))

  await wait(6000)
  console.log('after done:', await run(win, `JSON.stringify({
    done: window.__download.doneCount,
    overall: window.__download.overallPercent,
    statuses: window.__download.tasks.map(t => t.status),
    hasActive: window.__download.hasActive
  })`))

  const filesAfter = fs.readdirSync(TEST_DIR).filter((f) => f.endsWith('.mp3'))
  console.log('files:', JSON.stringify(filesAfter), '| sizes:', JSON.stringify(filesAfter.map((f) => fs.statSync(path.join(TEST_DIR, f)).size)))

  // ---- 2. 中途取消：半成品必须被删除 ----
  await run(win, `(() => {
    const d = window.__download
    d.tasks = []
    d.enqueue([{ id: 777, name: '慢速取消测试', ar: [{ name: 'X' }] }], 'exhigh', { openPanel: false })
    window.__cancelTaskId = d.tasks[0].id
  })()`)
  await wait(700)
  console.log('before cancel:', await run(win, `JSON.stringify({ status: window.__download.tasks[0].status, loaded: window.__download.tasks[0].loaded })`))
  await run(win, `window.__download.cancel(window.__cancelTaskId)`)
  await wait(700)
  console.log('after cancel:', await run(win, `JSON.stringify({ status: window.__download.tasks[0].status, active: window.__download.activeCount })`))
  const filesAfterCancel = fs.readdirSync(TEST_DIR).filter((f) => f.includes('777') || f.includes('慢速'))
  console.log('leftover partial files:', JSON.stringify(filesAfterCancel))

  // ---- 3a. 永久失败态 ----
  await run(win, `(() => {
    const d = window.__download
    d.tasks = []
    d.enqueue([{ id: 999, name: '取不到流', ar: [] }], 'exhigh', { openPanel: false })
  })()`)
  await wait(1200)
  console.log('failed state:', await run(win, `JSON.stringify({ status: window.__download.tasks[0].status, error: window.__download.tasks[0].error, failed: window.__download.failedCount })`))

  // ---- 3b. 首次失败 -> 重试成功（验证 retry 闭环）----
  await run(win, `(() => {
    const d = window.__download
    d.tasks = []
    d.enqueue([{ id: 888, name: '重试可成功', ar: [{ name: 'Y' }] }], 'exhigh', { openPanel: false })
  })()`)
  await wait(1200)
  console.log('retry-before:', await run(win, `JSON.stringify({ status: window.__download.tasks[0].status, failed: window.__download.failedCount })`))
  await run(win, `window.__download.retry(window.__download.tasks[0].id)`)
  await wait(3000)
  console.log('retry-after:', await run(win, `JSON.stringify({ status: window.__download.tasks[0].status, done: window.__download.doneCount, failed: window.__download.failedCount })`))

  // ---- 4. 抽屉 UI 截图（先取消并等待在途任务结束，再清空 toast，造一组多状态任务）----
  await run(win, `(() => {
    const d = window.__download
    d.cancelAll()
    d.tasks = []
    window.__ui.toasts = []
  })()`)
  await wait(900)
  await run(win, `(() => {
    const d = window.__download
    d.tasks = [
      { id: 9001, songId: 9001, name: '已完成示例歌曲', artist: '塞壬唱片', status: 'done', progress: 100, loaded: 200000, total: 200000, size: 200000, error: '', path: '' },
      { id: 9002, songId: 9002, name: '正在下载的歌曲', artist: '歌手 B', status: 'downloading', progress: 46, loaded: 92000, total: 200000, size: 0, error: '', path: '' },
      { id: 9003, songId: 9003, name: '等待中的歌曲', artist: '歌手 C', status: 'queued', progress: 0, loaded: 0, total: 0, size: 0, error: '', path: '' },
      { id: 9004, songId: 9004, name: '失败的歌曲', artist: '歌手 D', status: 'error', progress: 0, loaded: 0, total: 0, size: 0, error: '拿不到下载地址', path: '' },
      { id: 9005, songId: 9005, name: '已取消的歌曲', artist: '歌手 E', status: 'canceled', progress: 0, loaded: 0, total: 0, size: 0, error: '', path: '' }
    ]
    window.__ui.toggleDownloads(true)
  })()`)
  await wait(500)
  const img = await win.webContents.capturePage()
  const shot = path.join(__dirname, '..', 'shots', 'chk-download-panel.png')
  fs.writeFileSync(shot, img.toPNG())
  console.log('shot:', shot)
  console.log('ui:', await run(win, `JSON.stringify({
    panel: !!document.querySelector('.dl'),
    tasks: document.querySelectorAll('.dl__task').length,
    fill: document.querySelector('.dl__task-fill')?.style.width,
    overall: document.querySelector('.dl__ov-fill')?.style.width,
    badge: document.querySelector('.dl-entry__badge')?.textContent
  })`))

  clearTimeout(timeout)
  server.close()
  app.quit()
}).catch((err) => { console.error('TEST ERROR', err); app.exit(1) })
