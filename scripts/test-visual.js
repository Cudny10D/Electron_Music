const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')

app.disableHardwareAcceleration()
const OUT = path.join(__dirname, '..', 'shots')
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const run = (win, code) => win.webContents.executeJavaScript(code, true)

async function shot(win, name) {
  const img = await win.webContents.capturePage()
  fs.writeFileSync(path.join(OUT, `${name}.png`), img.toPNG())
  console.log('captured', name)
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    show: false,
    webPreferences: { offscreen: true, webSecurity: false }
  })
  win.webContents.on('console-message', (event, level, message) => {
    if (level >= 2 && !message.includes('Security') && !message.includes('Feature flag')) console.log('[c]', message)
  })

  await win.loadURL('http://localhost:5273/#/')
  await wait(4000)

  // 1) 自定义背景图（用一张已有图片当背景）
  const bg = path.join(OUT, '01-home.png').replace(/\\/g, '/')
  await run(win, `window.__settings.update({ theme: 'light', customBg: '${bg}' })`)
  await wait(1200)
  await shot(win, 'bg-custom')

  await run(win, `window.__settings.update({ customBg: '' })`)
  await wait(600)

  // 2) 搜索历史下拉：先搜两次
  await run(win, `location.hash = '#/search?keywords=周杰伦'`)
  await wait(3500)
  await run(win, `location.hash = '#/search?keywords=陈奕迅'`)
  await wait(3500)
  await run(win, `location.hash = '#/'`)
  await wait(1200)
  await run(win, `document.querySelector('.search input').click()`)
  await wait(700)
  await shot(win, 'search-recents')

  // 3) 设置搜索过滤
  await run(win, `location.hash = '#/settings'`)
  await wait(2000)
  await run(
    win,
    `(() => {
      const input = document.querySelector('.settings__search input');
      input.value = '音质';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`
  )
  await wait(800)
  await shot(win, 'settings-filter')

  // 4) 清空过滤，截浅色设置页（看新行）
  await run(
    win,
    `(() => {
      const input = document.querySelector('.settings__search input');
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('.body').scrollTop = 0;
    })()`
  )
  await wait(600)
  await shot(win, 'light-settings-new')

  app.quit()
})
