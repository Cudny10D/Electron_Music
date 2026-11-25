/**
 * 综合探针：头像菜单 / 四个资料库分区 / Hydrogen 歌单详情 / 添加到歌单 /
 * 分享图标 / 歌单弹窗 / 本地扫描与播放 / 暗色 toast / 独立设置与历史页
 *
 * 通过替换 axios adapter 注入假 API，不依赖真实网易云账号与网络。
 * 运行前需 npm run dev（5273）；输出截图落在 shots/。
 */
const { app, BrowserWindow, clipboard } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const registerIpc = require('../src/electron/ipcMain')

const ROOT = path.join(__dirname, '..')
const OUT = path.join(ROOT, 'shots')
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const run = (win, code) => win.webContents.executeJavaScript(code, true)
const shot = async (win, name) => {
  const img = await win.webContents.capturePage()
  fs.writeFileSync(path.join(OUT, name), img.toPNG())
}

// 造几个本地音频文件，供扫描验证
const tmpDir = path.join(os.tmpdir(), 'em-local-probe')
fs.mkdirSync(tmpDir, { recursive: true })
for (const f of ['Aimer - Eclipse.mp3', '02 ヨルシカ - 晴る.flac', '纯音乐.wav', 'notes.txt']) {
  fs.writeFileSync(path.join(tmpDir, f), Buffer.alloc(f.endsWith('.txt') ? 12 : 2048))
}

const UID = 12231591030
const FAKE = {
  playlists: [
    { id: 3778678, name: '氷雨_Hisame喜欢的音乐', specialType: 5, creator: { userId: UID, nickname: '氷雨_Hisame' }, trackCount: 3, coverImgUrl: '', playCount: 0, createTime: 1720291200000 },
    { id: 9001, name: '【流行】夏日甜筒 This Summer', creator: { userId: UID, nickname: '氷雨_Hisame' }, trackCount: 57, coverImgUrl: '', playCount: 12345, createTime: 1720291200000 },
    { id: 9002, name: '饮冰室合集', creator: { userId: UID, nickname: '氷雨_Hisame' }, trackCount: 36, coverImgUrl: '', playCount: 888, createTime: 1720291200000 },
    { id: 9003, name: '导入音乐 2025/2/24', creator: { userId: UID, nickname: '氷雨_Hisame' }, trackCount: 72, coverImgUrl: '', playCount: 555, createTime: 1720291200000 },
    { id: 9004, name: '别人的精选集', creator: { userId: 777, nickname: '网易云' }, trackCount: 20, coverImgUrl: '', playCount: 9999, createTime: 1720291200000 }
  ],
  songs: [
    { id: 11, name: 'Color Your Night', ar: [{ id: 1, name: 'Lotus Juice' }], al: { id: 1, name: 'PERSONA', picUrl: '' }, dt: 227000 },
    { id: 12, name: 'BATTLEPLAN ARCLIGHT', ar: [{ id: 2, name: '塞壬唱片-MSR' }], al: { id: 1, name: 'PERSONA', picUrl: '' }, dt: 224000 },
    { id: 13, name: 'Speed of Light', ar: [{ id: 3, name: '塞壬唱片-MSR' }], al: { id: 1, name: 'PERSONA', picUrl: '' }, dt: 245000 },
    { id: 14, name: 'にっこり^^調査隊のテーマ', ar: [{ id: 4, name: 'ワンダーランズ' }], al: { id: 1, name: 'PERSONA', picUrl: '' }, dt: 206000 },
    { id: 15, name: '小悪魔だってかまわない!', ar: [{ id: 5, name: '叶' }], al: { id: 1, name: 'PERSONA', picUrl: '' }, dt: 209000 }
  ]
}

const TASKS = [
  { id: 901, songId: 1, name: 'Eclipse', artist: 'Aimer', status: 'done', progress: 100, loaded: 204800, total: 204800, size: 204800, error: '', path: 'C:/Music/Eclipse.mp3' },
  { id: 902, songId: 2, name: '冬日又来临', artist: '罗言', status: 'downloading', progress: 46, loaded: 94208, total: 204800, size: 0, error: '', path: '' },
  { id: 903, songId: 3, name: 'Hong Kong', artist: 'The Weeknd', status: 'queued', progress: 0, loaded: 0, total: 0, size: 0, error: '', path: '' },
  { id: 904, songId: 4, name: '惊兔子嘛', artist: '施东山', status: 'error', progress: 0, loaded: 0, total: 0, size: 0, error: '拿不到下载地址', path: '' }
]

const clickTab = (label) =>
  `([...document.querySelectorAll('.library__item')].find(e => e.querySelector('.library__label').textContent.trim() === ${JSON.stringify(label)}) || {}).click?.()`

app.setPath('userData', path.join(ROOT, '.probe-profile'))
app.disableHardwareAcceleration()

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1440,
    height: 960,
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
  await wait(2400)

  // ---- 0. 假 API + 登录态 + 下载任务 + 本地目录 ----
  await run(win, `(async () => {
    const req = (await import('/src/utils/request.js')).default
    window.__FAKE = ${JSON.stringify(FAKE)}
    req.defaults.adapter = (config) => {
      const url = String(config.url || '')
      const f = window.__FAKE
      let data = { code: 200 }
      if (url.includes('/user/playlist')) data = { playlist: f.playlists }
      else if (url.includes('/playlist/detail')) data = { playlist: f.playlists.find(p => String(p.id) === String(config.params?.id)) || f.playlists[1] }
      else if (url.includes('/playlist/track/all')) data = { songs: f.songs, privileges: [] }
      else if (url.includes('/song/detail')) data = { songs: f.songs }
      else if (url.includes('/playlist/create')) data = { code: 200, playlist: { id: 9010, name: config.params?.name } }
      return Promise.resolve({ data, status: 200, statusText: 'OK', headers: {}, config })
    }
    return true
  })()`)
  await run(win, `(() => {
    const u = window.__pinia._s.get('userStore')
    u.user = { userId: ${UID}, nickname: '氷雨_Hisame', avatarUrl: '' }
    u.likelist = [11, 12, 13]
    window.__download.tasks = ${JSON.stringify(TASKS)}
    window.__local.folders = ${JSON.stringify([tmpDir])}
  })()`)
  await wait(300)
  await run(win, `document.querySelector('.library__refresh')?.click()`)
  await wait(800)

  // ---- 1. 四个一级标签 + 二级标签 ----
  console.log('tabs:', await run(win, `JSON.stringify([...document.querySelectorAll('.library__item')].map(e => e.querySelector('.library__label').textContent.trim()))`))
  console.log('sub tabs:', await run(win, `JSON.stringify([...document.querySelectorAll('.library__sub')].map(e => e.textContent.trim()))`))

  // 默认选中「我喜欢的音乐」→ 右栏 Hydrogen 详情 + 歌曲表
  await run(win, `document.querySelectorAll('.library__row')[0]?.click()`)
  await wait(700)
  console.log('likes detail:', await run(win, `JSON.stringify({
    head: !!document.querySelector('.pl-head'),
    title: document.querySelector('.pl-head__title')?.textContent.trim(),
    rows: document.querySelectorAll('.library-view .track').length,
    playAll: [...document.querySelectorAll('.pl-head__acts .hb-btn')].some(b => b.textContent.includes('播放全部')),
    selected: document.querySelectorAll('.library__row.is-selected').length
  })`))
  await shot(win, 'chk-my-tabs.png')

  // 点第二条（自己创建的歌单）→ 走 playlist/detail + track/all
  await run(win, `document.querySelectorAll('.library__row')[1]?.click()`)
  await wait(700)
  console.log('playlist detail:', await run(win, `JSON.stringify({
    title: document.querySelector('.pl-head__title')?.textContent.trim(),
    date: document.querySelector('.pl-head__date')?.textContent.trim(),
    tracks: document.querySelectorAll('.library-view .track').length,
    share: !!document.querySelector('.pl-head__acts .share-btn'),
    detailBtn: [...document.querySelectorAll('.pl-head__side .hb-btn')].some(b => b.textContent.includes('查看详情'))
  })`))
  await shot(win, 'chk-my-detail.png')

  // tracker 精确对齐 + 缩略图列表
  console.log('hydrogen struct:', await run(win, `(() => {
    const bar = document.querySelector('.library__bar')
    const active = document.querySelector('.library__item.is-active')
    return JSON.stringify({
      barWidth: Math.round(parseFloat(bar?.style.width || '0')),
      activeWidth: active?.offsetWidth || 0,
      rows: document.querySelectorAll('.library__row').length,
      thumbs: document.querySelectorAll('.library__thumb').length,
      head: document.querySelector('.view-head__title')?.textContent.trim(),
      compact: !!document.querySelector('.view-head.is-compact')
    })
  })()`))

  // 二级「我收藏的」→ 左栏列表换成收藏歌单
  await run(win, `([...document.querySelectorAll('.library__sub')].find(e => e.textContent.trim() === '我收藏的') || {}).click?.()`)
  await wait(500)
  console.log('sub tab:', await run(win, `JSON.stringify({
    sub: document.querySelector('.view-head__sub')?.textContent.trim(),
    active: document.querySelector('.library__sub.is-active')?.textContent.trim(),
    firstRow: document.querySelector('.library__row-name')?.textContent.trim()
  })`))
  await run(win, `([...document.querySelectorAll('.library__sub')].find(e => e.textContent.trim() === '我创建的') || {}).click?.()`)
  await wait(350)

  // ---- 2. 头像下拉菜单：设置 / 退出登录，且不跳「我的音乐」 ----
  await run(win, `document.querySelector('.account__chip')?.click()`)
  await wait(350)
  console.log('account menu:', await run(win, `JSON.stringify({
    open: !!document.querySelector('.account-menu'),
    items: [...document.querySelectorAll('.account-menu__item')].map(e => e.textContent.trim()),
    hash: location.hash
  })`))
  await shot(win, 'chk-account-menu.png')
  await run(win, `([...document.querySelectorAll('.account-menu__item')].find(e => e.textContent.includes('设置')) || {}).click?.()`)
  await wait(700)
  console.log('settings page:', await run(win, `JSON.stringify({
    hash: location.hash,
    settings: !!document.querySelector('.settings'),
    menuClosed: !document.querySelector('.account-menu'),
    noLibraryTab: !document.querySelector('.library__item')
  })`))
  await shot(win, 'chk-tab-settings.png')

  await win.loadURL('http://localhost:5273/#/history')
  await wait(900)
  console.log('history page:', await run(win, `JSON.stringify({ hash: location.hash, history: !!document.querySelector('.history') })`))
  await win.loadURL('http://localhost:5273/#/my')
  await wait(1200)

  // ---- 3. 添加到歌单：歌曲行 / 全屏播放器 / 底栏三处入口 ----
  await run(win, `document.querySelectorAll('.library__row')[1]?.click()`)
  await wait(600)
  console.log('add entries:', await run(win, `JSON.stringify({
    row: document.querySelectorAll('.track__act-btn[title="添加到歌单"]').length,
    mini: document.querySelectorAll('.player .ctrl[title="添加到歌单"]').length
  })`))
  const npEntry = await run(win, `(async () => {
    window.__ui.toggleNowPlaying(true)
    await new Promise(r => setTimeout(r, 500))
    const n = document.querySelectorAll('.np__icon[title="添加到歌单"]').length
    window.__ui.toggleNowPlaying(false)
    return n
  })()`)
  console.log('nowplaying add entry:', npEntry)

  await run(win, `document.querySelector('.track__act-btn[title="添加到歌单"]')?.click()`)
  await wait(600)
  console.log('add dialog:', await run(win, `JSON.stringify({
    open: !!document.querySelector('.ap'),
    title: document.querySelector('.ap__title')?.textContent.trim(),
    song: document.querySelector('.ap__song-name')?.textContent.trim(),
    rows: document.querySelectorAll('.ap__row').length,
    create: !!document.querySelector('.ap__create')
  })`))
  await shot(win, 'chk-add-playlist.png')
  await run(win, `document.querySelector('.ap__row')?.click()`)
  await wait(500)
  console.log('add done:', await run(win, `JSON.stringify({
    closed: !document.querySelector('.ap'),
    toast: window.__ui.toasts.map(t => t.text)
  })`))

  // ---- 4. 下载管理二级「正在下载 / 下载完成」 ----
  await run(win, clickTab('下载管理'))
  await wait(500)
  console.log('download subs:', await run(win, `JSON.stringify([...document.querySelectorAll('.library__sub')].map(e => e.textContent.trim()))`))
  await run(win, `window.__download.tasks = ${JSON.stringify(TASKS)}`)
  await wait(350)
  console.log('download active rows:', await run(win, `document.querySelectorAll('.library__row').length`))
  await run(win, `([...document.querySelectorAll('.library__sub')].find(e => e.textContent.trim() === '下载完成') || {}).click?.()`)
  await wait(400)
  console.log('download done rows:', await run(win, `document.querySelectorAll('.library__row').length`))
  await run(win, `([...document.querySelectorAll('.library__sub')].find(e => e.textContent.trim() === '正在下载') || {}).click?.()`)
  await wait(300)
  // 清掉上一步「添加到歌单」留下的 toast，避免污染截图
  await run(win, `(() => { window.__ui.toasts.splice(0); return true })()`)
  await wait(200)
  await shot(win, 'chk-tab-downloads.png')

  // ---- 5. 本地管理扫描与 file:// 播放 ----
  await run(win, clickTab('本地管理'))
  await wait(500)
  await run(win, `window.__local.scan()`)
  await wait(900)
  console.log('local scan:', await run(win, `JSON.stringify({
    count: window.__local.files.length,
    names: window.__local.files.map(f => f.name),
    rows: document.querySelectorAll('.local .track').length
  })`))
  await run(win, `(() => { window.__ui.toasts.splice(0); return true })()`)
  await wait(150)
  await shot(win, 'chk-tab-local.png')
  console.log('local play:', await run(win, `(async () => {
    const l = window.__local, p = window.__player
    l.playAll(l.files)
    await new Promise(r => setTimeout(r, 600))
    return JSON.stringify({ songId: p.songId, loading: p.loading, name: p.currentSong?.name, local: p.currentSong?.local })
  })()`))

  // ---- 6. 分享：链接 + 真实剪贴板 + 新图标（三节点） ----
  const links = await run(win, `(async () => {
    const m = await import('/src/utils/share.js')
    return JSON.stringify({
      playlist: m.shareLink('playlist', 123),
      album: m.shareLink('album', 456),
      artist: m.shareLink('artist', 789),
      song: m.shareLink('song', 321)
    })
  })()`)
  console.log('share links:', links)
  console.log('share copy:', await run(win, `(async () => {
    const m = await import('/src/utils/share.js')
    const ok = await m.copyShare('playlist', { id: 3778678, name: '测试歌单' })
    return JSON.stringify({ ok, toast: window.__ui.toasts.map(t => t.text) })
  })()`), 'clipboard:', clipboard.readText())
  await win.loadURL('http://localhost:5273/#/playlist/3778678')
  await wait(1000)
  console.log('share icon:', await run(win, `JSON.stringify({
    btn: !!document.querySelector('.head__actions .share-btn'),
    nodes: document.querySelectorAll('.head__actions .share-btn svg circle').length
  })`))

  // ---- 7. 歌单管理弹窗 + 详情页三按钮 ----
  await win.loadURL('http://localhost:5273/#/my')
  await wait(1100)
  console.log('create dialog:', await run(win, `(() => {
    const b = document.querySelector('.my__create'); if (!b) return 'no-button'
    b.click(); return 'clicked'
  })()`))
  await wait(400)
  console.log('dialog:', await run(win, `JSON.stringify({
    open: !!document.querySelector('.pm'),
    title: document.querySelector('.pm__title')?.textContent.trim(),
    fields: document.querySelectorAll('.pm__field').length
  })`))
  await run(win, `(() => { window.__ui.toasts.splice(0); return true })()`)
  await wait(150)
  await shot(win, 'chk-playlist-dialog.png')
  await run(win, `document.querySelector('.pm__head .hb-icon-btn')?.click()`)
  await wait(250)

  await win.loadURL('http://localhost:5273/#/playlist/3778678')
  await wait(900)
  await run(win, `(() => {
    const lib = window.__pinia._s.get('libraryStore')
    const u = window.__pinia._s.get('userStore')
    lib.info = { id: 3778678, name: '我的歌单', trackCount: 2, creator: { userId: u.user.userId }, description: '测试' }
    lib.songs = [{ id: 11, name: '歌一', ar: [{ name: 'A' }], al: { name: '专辑' }, dt: 200000 }, { id: 12, name: '歌二', ar: [{ name: 'B' }], al: { name: '专辑' }, dt: 210000 }]
    lib.loading = false; lib.error = ''
  })()`)
  await wait(350)
  console.log('detail actions:', await run(win, `JSON.stringify({
    share: !!document.querySelector('.head__actions .share-btn'),
    edit: [...document.querySelectorAll('.head__actions .hb-btn')].some(b => b.textContent.includes('编辑')),
    add: [...document.querySelectorAll('.head__actions .hb-btn')].some(b => b.textContent.includes('添加歌曲'))
  })`))

  // ---- 8. 暗色 toast ----
  await run(win, `document.documentElement.dataset.theme = 'dark'`)
  await run(win, `window.__ui.toast('已加入下载队列：1 首')`)
  await wait(350)
  console.log('toast dark:', await run(win, `(() => {
    const e = document.querySelector('.toast'), s = getComputedStyle(e)
    return JSON.stringify({ bg: s.backgroundColor, fg: s.color, border: s.borderColor })
  })()`))
  await shot(win, 'chk-toast-dark.png')
  // 结尾必须返回简单值：splice 的返回值是 Pinia 响应式 Proxy 数组，无法跨 IPC 结构化克隆
  await run(win, `(() => { document.documentElement.dataset.theme = 'light'; window.__ui.toasts.splice(0); return true })()`)
  await wait(250)

  // ---- 9. NONE 空态画框：清空假歌单后刷新 ----
  await win.loadURL('http://localhost:5273/#/my')
  await wait(1000)
  await run(win, `(async () => {
    const req = (await import('/src/utils/request.js')).default
    req.defaults.adapter = (config) => Promise.resolve({ data: { playlist: [], code: 200 }, status: 200, statusText: 'OK', headers: {}, config })
  })()`)
  await run(win, `document.querySelector('.library__refresh')?.click()`)
  await wait(700)
  await run(win, clickTab('收藏'))
  await wait(450)
  console.log('none state:', await run(win, `JSON.stringify({
    none: !!document.querySelector('.lib-none'),
    corners: document.querySelectorAll('.lib-none__corner').length,
    diags: document.querySelectorAll('.lib-none__diag').length
  })`))
  await run(win, `(() => { window.__ui.toasts.splice(0); return true })()`)
  await wait(450)
  await shot(win, 'chk-lib-none.png')

  console.log('DONE')
  app.quit()
}).catch((e) => { console.error('PROBE ERROR', e); app.exit(1) })
