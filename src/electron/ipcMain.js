const { ipcMain, clipboard, dialog, shell } = require('electron')
const axios = require('axios')
const fs = require('fs')
const path = require('path')
const { pathToFileURL } = require('url')
const Store = require('electron-store')
const registerShortcuts = require('./shortcuts')

const DEFAULT_SETTINGS = {
  music: { level: 'exhigh' },
  download: { folder: '' },
  other: { quitApp: 'minimize', globalShortcuts: true, rememberWindow: true }
}

module.exports = function registerIpc(win, app, quitApp, lyric = {}) {
  const settingsStore = new Store({ name: 'settings' })
  const playlistStore = new Store({ name: 'lastPlaylist' })

  ipcMain.on('window-min', () => win.minimize())

  ipcMain.on('window-max', () => {
    if (win.isMaximized()) win.restore()
    else win.maximize()
  })

  ipcMain.on('window-close', async () => {
    const settings = settingsStore.get('settings') || DEFAULT_SETTINGS
    if (settings.other.quitApp === 'minimize') win.hide()
    else win.close()
  })

  ipcMain.handle('get-settings', () => {
    const settings = settingsStore.get('settings')
    if (settings) return settings
    settingsStore.set('settings', DEFAULT_SETTINGS)
    return DEFAULT_SETTINGS
  })

  ipcMain.on('set-settings', (e, settings) => {
    settingsStore.set('settings', settings)
    registerShortcuts(win)
  })

  ipcMain.handle('get-last-playlist', () => playlistStore.get('playlist') || null)

  ipcMain.on('save-last-playlist', (e, playlist) => {
    playlistStore.set('playlist', playlist)
  })

  ipcMain.on('exit-app', (e, playlist) => {
    if (playlist) playlistStore.set('playlist', playlist)
    quitApp()
  })

  ipcMain.on('copy-txt', (e, txt) => clipboard.writeText(txt))

  ipcMain.on('set-window-title', (e, title) => win.setTitle(title))

  ipcMain.on('register-shortcuts', () => registerShortcuts(win))

  ipcMain.on('app-quit', () => quitApp())

  /* ---------------------------- 下载 ---------------------------- */

  const defaultDownloadDir = () => path.join(app.getPath('music'), 'ElectronMusic')

  const resolveDownloadDir = () => {
    const settings = settingsStore.get('settings')
    const configured = settings?.download?.folder
    return configured && configured.trim() ? configured : defaultDownloadDir()
  }

  ipcMain.handle('get-download-dir', () => resolveDownloadDir())

  ipcMain.handle('choose-download-dir', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: '选择下载目录',
      properties: ['openDirectory', 'createDirectory']
    })
    return canceled ? null : filePaths[0]
  })

  ipcMain.handle('open-dir', async (e, dir) => {
    const target = dir && String(dir).trim() ? dir : resolveDownloadDir()
    try {
      fs.mkdirSync(target, { recursive: true })
    } catch (err) {
      return '无法创建目录'
    }
    return shell.openPath(target)
  })

  ipcMain.handle('choose-image', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: '选择背景图片',
      properties: ['openFile'],
      filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp'] }]
    })
    return canceled ? null : filePaths[0]
  })

  ipcMain.handle('reveal-file', (e, filePath) => {
    try {
      if (filePath && fs.existsSync(filePath)) shell.showItemInFolder(filePath)
    } catch (err) {
      // 文件可能已被移动，忽略
    }
  })

  /* ---------------------- 本地音乐 / 歌单封面 ---------------------- */

  const AUDIO_EXT = new Set(['.mp3', '.flac', '.wav', '.m4a', '.aac', '.ogg', '.wma', '.ape', '.opus'])
  const MAX_SCAN_FILES = 3000

  /**
   * 从文件名猜歌手 / 标题。通用目录按「歌手 - 歌名」，本项目下载目录按「歌名 - 歌手」
   * （buildFileName 生成的是 `${song.name} - ${artist}`），两套顺序可通过 nameOrder 指定。
   */
  const parseAudioName = (base, order) => {
    const s = base.replace(/^\d{1,3}[\s.\-_]+/, '').trim()
    const parts = s.split(/\s+-\s+/)
    if (parts.length >= 2) {
      if (order === 'song-artist') {
        return { artist: parts.slice(1).join(' - ').trim(), name: parts[0].trim() }
      }
      return { artist: parts[0].trim(), name: parts.slice(1).join(' - ').trim() }
    }
    return { artist: '', name: s || base }
  }

  const walkAudio = (dir, out, depth = 0, order = 'artist-song') => {
    if (depth > 6 || out.length >= MAX_SCAN_FILES) return
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch (err) {
      return
    }
    for (const ent of entries) {
      if (out.length >= MAX_SCAN_FILES) return
      const full = path.join(dir, ent.name)
      if (ent.isDirectory()) {
        if (!ent.name.startsWith('.')) walkAudio(full, out, depth + 1, order)
      } else if (ent.isFile() && AUDIO_EXT.has(path.extname(ent.name).toLowerCase())) {
        let size = 0
        try {
          size = fs.statSync(full).size
        } catch (err) {
          // 忽略
        }
        const parsed = parseAudioName(path.basename(ent.name, path.extname(ent.name)), order)
        out.push({
          id: `local:${full}`,
          name: parsed.name,
          artist: parsed.artist,
          path: full,
          url: pathToFileURL(full).href,
          ext: path.extname(ent.name).slice(1).toLowerCase(),
          size,
          folder: path.basename(dir),
          local: true,
          dt: 0,
          ar: parsed.artist ? [{ name: parsed.artist }] : [],
          al: { name: path.basename(dir) }
        })
      }
    }
  }

  ipcMain.handle('local-pick-folders', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: '添加本地音乐目录',
      properties: ['openDirectory', 'multiSelections']
    })
    return canceled ? [] : filePaths
  })

  ipcMain.handle('local-scan', (e, dirs, opts) => {
    const out = []
    const seen = new Set()
    for (const dir of dirs || []) {
      if (!dir || seen.has(dir)) continue
      seen.add(dir)
      walkAudio(String(dir), out, 0, opts?.nameOrder || 'artist-song')
    }
    out.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
    return out
  })

  ipcMain.handle('pick-cover-image', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: '选择歌单封面',
      properties: ['openFile'],
      filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'webp'] }]
    })
    if (canceled || !filePaths[0]) return null
    const file = filePaths[0]
    try {
      if (fs.statSync(file).size > 8 * 1024 * 1024) return { error: '图片不能超过 8 MB' }
      const buf = fs.readFileSync(file)
      const ext = path.extname(file).toLowerCase()
      const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg'
      return { name: path.basename(file), mime, dataUrl: `data:${mime};base64,${buf.toString('base64')}` }
    } catch (err) {
      return { error: err?.message || '读取图片失败' }
    }
  })

  // taskId -> 正在进行的下载。批量队列靠它把进度回传给对应任务、并支持中途取消。
  const activeDownloads = new Map()

  const removePartial = (filePath) => {
    try {
      if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath)
    } catch (err) {
      // 文件可能被占用，忽略
    }
  }

  ipcMain.on('download-cancel', (e, taskId) => {
    const job = activeDownloads.get(String(taskId))
    if (!job || job.canceled) return
    job.canceled = true
    try { job.controller?.abort() } catch (err) {}
    try { job.response?.data?.unpipe?.(job.writer) } catch (err) {}
    try { job.response?.data?.destroy?.() } catch (err) {}
    try { job.writer?.destroy?.() } catch (err) {}
  })

  ipcMain.handle('download-song', async (e, { url, fileName, dir, taskId }) => {
    const id = String(taskId ?? '')
    let filePath = null
    try {
      if (!url) return { ok: false, error: '没有可用的音频地址' }
      const target = dir && String(dir).trim() ? dir : resolveDownloadDir()
      fs.mkdirSync(target, { recursive: true })

      const safeName = String(fileName || 'track.mp3').replace(/[\\/:*?"<>|]/g, '_')
      filePath = path.join(target, safeName)
      // 同名文件自动加序号，不覆盖
      let index = 1
      while (fs.existsSync(filePath)) {
        const ext = path.extname(safeName)
        filePath = path.join(target, `${path.basename(safeName, ext)} (${index++})${ext}`)
      }

      const controller = new AbortController()
      const job = { canceled: false, controller, response: null, writer: null }
      if (id) activeDownloads.set(id, job)

      const response = await axios.get(url, {
        responseType: 'stream',
        timeout: 120000,
        maxRedirects: 5,
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://music.163.com/' }
      })
      job.response = response

      const total = Number(response.headers['content-length']) || 0
      let loaded = 0
      let lastSent = 0
      const sendProgress = (force) => {
        if (!id || job.canceled) return
        const now = Date.now()
        if (!force && now - lastSent < 110) return // 节流，别把渲染层刷爆
        lastSent = now
        e.sender.send('download-progress', {
          taskId: id,
          loaded,
          total,
          percent: total ? Math.min(100, Math.round((loaded / total) * 100)) : 0
        })
      }

      response.data.on('data', (chunk) => {
        loaded += chunk.length
        sendProgress(false)
      })

      // 用 close 而不是 finish：被 destroy 取消时 close 同样会触发，Promise 不会挂死
      await new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(filePath)
        job.writer = writer
        response.data.pipe(writer)
        writer.on('close', resolve)
        writer.on('error', reject)
        response.data.on('error', (err) => {
          if (!job.canceled) reject(err)
        })
        response.data.on('aborted', () => {
          if (!job.canceled) reject(new Error('下载被中断'))
        })
      })

      if (job.canceled) {
        removePartial(filePath)
        return { ok: false, canceled: true }
      }

      sendProgress(true)
      return { ok: true, path: filePath, size: loaded }
    } catch (err) {
      removePartial(filePath)
      const job = id ? activeDownloads.get(id) : null
      const canceled = job?.canceled || err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError'
      return {
        ok: false,
        canceled,
        error: canceled ? '已取消' : err?.message || String(err)
      }
    } finally {
      if (id) activeDownloads.delete(id)
    }
  })

  /* ---------------------------- 桌面歌词 ---------------------------- */

  // 主窗口切换歌词窗（返回是否可见，供 UI 同步状态）
  ipcMain.handle('desktop-lyric-toggle', () => {
    return typeof lyric.toggleDesktopLyric === 'function' ? lyric.toggleDesktopLyric() : false
  })

  ipcMain.on('desktop-lyric-close', () => {
    if (typeof lyric.closeDesktopLyric === 'function') lyric.closeDesktopLyric()
  })

  // 桌面歌词鼠标穿透开关。forward:true 让窗口在穿透时仍收到 mousemove，
  // 歌词页据此在鼠标靠近右上角解锁把手时临时恢复命中，解决"锁死解不开"。
  ipcMain.on('desktop-lyric-locked', (e, passthrough) => {
    const win = typeof lyric.getLyricWindow === 'function' ? lyric.getLyricWindow() : null
    if (!win || win.isDestroyed()) return
    win.setIgnoreMouseEvents(!!passthrough, { forward: true })
  })

  // 主窗口推送歌词状态 -> 歌词窗
  ipcMain.on('desktop-lyric-update', (e, data) => {
    const win = typeof lyric.getLyricWindow === 'function' ? lyric.getLyricWindow() : null
    if (!win || win.isDestroyed()) return
    win.webContents.send('desktop-lyric-data', data)
  })

  // 歌词窗已就绪时，主窗口可主动拉一次最新状态（避免打开瞬间是空的）
  ipcMain.on('desktop-lyric-ready', () => {
    win.webContents.send('desktop-lyric-request-state')
  })
}
