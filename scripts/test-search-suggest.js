/**
 * 本轮四项改动的回归探针（离线、可复现）：
 *  1. 顶栏不再有「历史」
 *  2. 搜索历史下拉 / 我的音乐左栏 / 下载卡片都有亚克力（backdrop-filter + --glass-panel）
 *  3. 切板块只做右栏局部模糊淡入：无 translateY、不触发整页 page 过渡、范围不是全屏
 *  4. 搜索关键词推荐条目：/search/suggest 防抖调用、条目与类型标签、点击跳搜索页
 *
 * 通过替换 axios adapter 注入假 API，运行前需 npm run dev（5273）。
 */
const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')
const { pathToFileURL } = require('url')

const ROOT = path.join(__dirname, '..')
const OUT = path.join(ROOT, 'shots')
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const run = (win, code) => win.webContents.executeJavaScript(code, true)
const shot = async (win, name) => {
  const img = await win.webContents.capturePage()
  fs.writeFileSync(path.join(OUT, name), img.toPNG())
}

const SUGGEST = {
  allMatch: [
    { keyword: '明日方舟', type: 1018 },
    { keyword: '明日方舟 Arknights OST', type: 1 },
    { keyword: '塞壬唱片-MSR', type: 100 },
    { keyword: '明日方舟 原声集', type: 10 },
    { keyword: '明日方舟精选歌单', type: 1000 }
  ]
}

app.setPath('userData', path.join(__dirname, '..', '.shot-profile'))
app.disableHardwareAcceleration()
console.log('BOOT')

app.whenReady().then(async () => {
  console.log('READY')
  const win = new BrowserWindow({
    width: 1440,
    height: 960,
    show: false,
    webPreferences: {
      offscreen: true,
      webSecurity: false
    }
  })
  console.log('WINDOW')
  await win.loadURL('http://localhost:5273/#/my')
  console.log('LOADED')
  await wait(2400)

  // 假 API：/search/suggest 返回推荐条目，其余给空结果
  await run(win, `(async () => {
    const req = (await import('/src/utils/request.js')).default
    window.__SUGGEST = ${JSON.stringify(SUGGEST)}
    window.__SUGGEST_CALLS = []
    req.defaults.adapter = (config) => {
      const url = String(config.url || '')
      let data = { code: 200 }
      if (url.includes('/search/suggest')) {
        window.__SUGGEST_CALLS.push({ keywords: config.params?.keywords, type: config.params?.type })
        data = { code: 200, result: window.__SUGGEST }
      } else if (url.includes('/user/playlist')) data = { playlist: [] }
      return Promise.resolve({ data, status: 200, statusText: 'OK', headers: {}, config })
    }
    return true
  })()`)

  // 登录态 + 最近搜索
  await run(win, `(() => {
    const u = window.__pinia._s.get('userStore')
    u.user = { userId: 12231591030, nickname: '氷雨_Hisame', avatarUrl: '' }
    u.likelist = []
    const s = window.__pinia._s.get('searchStore')
    s.recents = ['明日方舟', 'ヨルシカ']
    return true
  })()`)
  await wait(500)

  let failed = 0
  const check = (name, ok, extra) => {
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}`, extra === undefined ? '' : JSON.stringify(extra))
    if (!ok) failed++
  }

  const glass = async (sel) =>
    JSON.parse(
      await run(
        win,
        `JSON.stringify((() => {
          const e = document.querySelector(${JSON.stringify(sel)})
          if (!e) return null
          const s = getComputedStyle(e)
          return {
            cls: e.className,
            bg: s.backgroundColor,
            blur: s.backdropFilter || s.webkitBackdropFilter || s.getPropertyValue('backdrop-filter')
          }
        })())`
      )
    )

  // ---- 1. 顶栏无「历史」 ----
  const nav = JSON.parse(
    await run(win, `JSON.stringify([...document.querySelectorAll('.nav__item')].map(e => e.textContent.trim()))`)
  )
  check('顶栏无历史', nav.length === 2 && !nav.includes('历史'), nav)

  // ---- 2. 无关键词：搜索历史下拉 + 亚克力 ----
  // 离屏窗口里原生 focus() 可能不派发事件，直接 click + focus 事件更可靠
  await run(win, `(() => {
    const i = document.querySelector('.search input')
    i.dispatchEvent(new Event('focus', { bubbles: true }))
    i.click()
    return true
  })()`)
  await wait(400)
  console.log(
    'state:',
    await run(win, `JSON.stringify({
      recents: window.__pinia._s.get('searchStore').recents,
      dropdown: !!document.querySelector('.recents'),
      head: document.querySelector('.recents__head')?.textContent.trim() || ''
    })`)
  )
  const recents = await glass('.recents')
  check(
    '搜索历史亚克力',
    !!recents && recents.cls.includes('hb-acrylic') && recents.blur !== 'none' && /^rgba/.test(recents.bg),
    recents
  )
  check(
    '无关键词显示最近搜索',
    await run(win, `document.querySelector('.recents__head')?.textContent.includes('最近搜索')`)
  )
  await shot(win, 'chk-suggest-history.png')

  // ---- 3. 有关键词：搜索建议 ----
  await run(win, `(() => {
    const i = document.querySelector('.search input')
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(i, '明日方舟')
    i.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  })()`)
  await wait(700)
  const suggest = JSON.parse(
    await run(win, `JSON.stringify({
      head: document.querySelector('.recents__head')?.textContent.trim() || '',
      items: [...document.querySelectorAll('.recents__item')].map(e => e.textContent.trim()),
      types: [...document.querySelectorAll('.recents__type')].map(e => e.textContent.trim()),
      calls: window.__SUGGEST_CALLS
    })`)
  )
  check(
    '搜索建议下拉',
    suggest.head.includes('搜索建议') &&
      suggest.items.length >= 5 &&
      suggest.types.includes('歌手') &&
      suggest.calls.some((c) => c.keywords === '明日方舟' && c.type === 'mobile'),
    suggest
  )
  await shot(win, 'chk-suggest.png')

  // 点第一条建议（index 0 是「搜索「xxx」」直达项）→ 跳搜索页
  await run(win, `(() => {
    document.querySelectorAll('.recents__item')[1]?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    return true
  })()`)
  await wait(700)
  const hash = await run(win, `location.hash`)
  check('点建议跳转搜索', hash.includes('#/search?keywords='), hash)

  // ---- 4. 回 /my 测卡片亚克力与切板块 ----
  await run(win, `(() => { location.hash = '#/my'; return true })()`)
  await wait(1000)
  const lib = await glass('.library')
  check('左栏亚克力', !!lib && lib.cls.includes('hb-acrylic') && lib.blur !== 'none', lib)
  await shot(win, 'chk-my-glass.png')

  const before = JSON.parse(
    await run(win, `JSON.stringify((() => { const r = document.querySelector('.library-view').getBoundingClientRect(); return { left: Math.round(r.left), width: Math.round(r.width), vw: innerWidth } })())`)
  )
  await run(win, `(() => {
    const b = [...document.querySelectorAll('.library__item')].find(e => e.querySelector('.library__label').textContent.trim() === '下载管理')
    b?.click()
    return true
  })()`)
  await wait(90)
  const during = JSON.parse(
    await run(win, `JSON.stringify((() => {
      const e = document.querySelector('.library-view')
      const s = getComputedStyle(e)
      const r = e.getBoundingClientRect()
      return {
        pageTransition: !!document.querySelector('.page-enter-active, .page-leave-active'),
        animation: s.animationName,
        transform: s.transform,
        left: Math.round(r.left), width: Math.round(r.width), vw: innerWidth
      }
    })())`)
  )
  check('切板块无整页过渡', during.pageTransition === false, during)
  check('右栏模糊淡入（无位移）', /^view-fade/.test(during.animation) && during.transform === 'none', during)
  check('动画范围仅右栏', during.left > 0 && during.width < during.vw, { before, during })
  await wait(600)
  const dl = await glass('.dl-card')
  check('下载卡片亚克力', !!dl && dl.cls.includes('hb-acrylic') && dl.blur !== 'none', dl)
  await shot(win, 'chk-my-switch.png')

  // ---- 5. 暗色 ----
  await run(win, `(() => { document.documentElement.dataset.theme = 'dark'; return true })()`)
  await wait(450)
  await shot(win, 'chk-my-glass-dark.png')

  console.log(failed ? `FAILED ${failed}` : 'ALL OK')
  app.quit()
}).catch((err) => {
  console.log('PROBE ERROR', err?.stack || String(err))
  app.quit()
})
