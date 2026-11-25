import { defineStore } from 'pinia'
import api from '../utils/windowApi'
import { useSettingsStore } from './settingsStore'
import { useUiStore } from './uiStore'
import { resolveStreamUrl, buildFileName } from '../utils/downloadCore'

let seq = 0
let idleNotified = false

/** 单个任务的执行流程：取流 -> 交主进程下载 -> 收结果，结束后由 pump 补位 */
export const useDownloadStore = defineStore('downloadStore', {
  state: () => ({
    // status: queued | fetching | downloading | done | error | canceled
    tasks: [],
    concurrency: 3
  }),

  getters: {
    activeCount: (s) => s.tasks.filter((t) => t.status === 'fetching' || t.status === 'downloading').length,
    queuedCount: (s) => s.tasks.filter((t) => t.status === 'queued').length,
    doneCount: (s) => s.tasks.filter((t) => t.status === 'done').length,
    failedCount: (s) => s.tasks.filter((t) => t.status === 'error').length,
    pendingCount: (s) => s.tasks.filter((t) => ['queued', 'fetching', 'downloading'].includes(t.status)).length,
    hasActive: (s) => s.tasks.some((t) => ['queued', 'fetching', 'downloading'].includes(t.status)),
    // 整体进度：按任务数平均，已完成的算 100%
    overallPercent: (s) => {
      const live = s.tasks.filter((t) => t.status !== 'canceled')
      if (!live.length) return 0
      const sum = live.reduce((acc, t) => acc + (t.status === 'done' ? 100 : t.progress || 0), 0)
      return Math.round(sum / live.length)
    }
  },

  actions: {
    setConcurrency(value) {
      this.concurrency = Math.min(5, Math.max(1, Number(value) || 3))
      this.pump()
    },

    /** 把一批歌加入队列。已是 queued/fetching/downloading 的同一首会被跳过，避免重复排队。 */
    enqueue(songs, quality, opts = {}) {
      const settings = useSettingsStore()
      const ui = useUiStore()
      const level = quality || settings.quality
      const dir = settings.downloadFolder || ''
      let added = 0
      let skipped = 0

      for (const song of songs || []) {
        if (!song?.id) continue
        const busy = this.tasks.some(
          (t) => t.songId === song.id && ['queued', 'fetching', 'downloading'].includes(t.status)
        )
        if (busy) {
          skipped++
          continue
        }
        this.tasks.unshift({
          id: ++seq,
          songId: song.id,
          name: song.name || '未知歌曲',
          artist: (song.ar || song.artists || []).map((a) => a.name).join(' / '),
          cover: song.al?.picUrl || song.album?.picUrl || '',
          fileName: buildFileName(song),
          quality: level,
          dir,
          status: 'queued',
          progress: 0,
          loaded: 0,
          total: 0,
          error: '',
          path: '',
          size: 0
        })
        added++
      }

      if (!added) {
        ui.toast(skipped ? '这些歌曲已在下载队列中' : '没有可下载的歌曲')
        return 0
      }
      idleNotified = false
      ui.toast(`已加入下载队列：${added} 首`)
      if (opts.openPanel !== false && added > 1) ui.toggleDownloads(true)
      this.pump()
      return added
    },

    /** 并发调度：把空闲槽位填满 */
    pump() {
      let active = this.activeCount
      for (const task of this.tasks) {
        if (active >= this.concurrency) break
        if (task.status !== 'queued') continue
        task.status = 'fetching'
        task.progress = 0
        task.error = ''
        active++
        this.runTask(task)
      }
    },

    async runTask(task) {
      try {
        const url = await resolveStreamUrl(task.songId, task.quality)
        if (task.status !== 'fetching') return // 期间被取消
        if (!url) {
          this.fail(task, '拿不到下载地址（版权或会员限制）')
          return
        }

        task.status = 'downloading'
        task.progress = 0
        task.loaded = 0
        task.total = 0

        const res = await api.downloadSong({
          url,
          fileName: task.fileName,
          dir: task.dir,
          taskId: task.id
        })

        if (task.status === 'canceled') return
        if (res?.canceled) {
          task.status = 'canceled'
          return
        }
        if (res?.ok) {
          task.status = 'done'
          task.progress = 100
          task.path = res.path || ''
          task.size = res.size || task.total || 0
          if (task.total) task.loaded = task.total
          return
        }
        this.fail(task, res?.error || '下载失败')
      } catch (err) {
        if (task.status !== 'canceled') this.fail(task, err?.message || String(err))
      } finally {
        this.pump()
        this.notifyIdle()
      }
    },

    fail(task, message) {
      task.status = 'error'
      task.error = message
    },

    /** 主进程进度事件（bootstrap 里注册桥接） */
    onProgress({ taskId, loaded, total, percent } = {}) {
      const task = this.tasks.find((t) => String(t.id) === String(taskId))
      if (!task || task.status !== 'downloading') return
      task.loaded = loaded || 0
      task.total = total || 0
      task.progress = percent || 0
    },

    cancel(id) {
      const task = this.tasks.find((t) => t.id === id)
      if (!task || ['done', 'error', 'canceled'].includes(task.status)) return
      const wasRunning = task.status === 'downloading' || task.status === 'fetching'
      task.status = 'canceled'
      task.progress = 0
      // fetching 阶段主进程还没登记这个 taskId，发取消也没害处（主进程找不到就忽略）
      if (wasRunning) api.cancelDownload(task.id)
      this.pump()
      this.notifyIdle()
    },

    retry(id) {
      const task = this.tasks.find((t) => t.id === id)
      if (!task || !['error', 'canceled'].includes(task.status)) return
      task.status = 'queued'
      task.progress = 0
      task.loaded = 0
      task.total = 0
      task.error = ''
      idleNotified = false
      this.pump()
    },

    retryFailed() {
      idleNotified = false
      for (const task of this.tasks) {
        if (task.status === 'error' || task.status === 'canceled') {
          task.status = 'queued'
          task.progress = 0
          task.error = ''
        }
      }
      this.pump()
    },

    remove(id) {
      const task = this.tasks.find((t) => t.id === id)
      if (!task) return
      if (task.status === 'downloading') api.cancelDownload(task.id)
      this.tasks = this.tasks.filter((t) => t.id !== id)
      this.pump()
      this.notifyIdle()
    },

    /** 清掉已完成/已取消/失败，保留进行中 */
    clearFinished() {
      this.tasks = this.tasks.filter((t) => ['queued', 'fetching', 'downloading'].includes(t.status))
    },

    cancelAll() {
      for (const task of this.tasks) {
        if (task.status === 'downloading') api.cancelDownload(task.id)
        if (['queued', 'fetching', 'downloading'].includes(task.status)) task.status = 'canceled'
      }
      this.notifyIdle()
    },

    openFolder() {
      const settings = useSettingsStore()
      api.openDir(settings.downloadFolder || '')
    },

    reveal(task) {
      if (task?.path) api.revealFile(task.path)
    },

    notifyIdle() {
      if (this.hasActive || idleNotified) return
      // 只有真的跑过一轮才提示，避免空队列启动时弹 toast
      if (!this.tasks.length) return
      idleNotified = true
      const ui = useUiStore()
      const done = this.doneCount
      const failed = this.failedCount
      if (done && !failed) ui.toast(`下载完成：${done} 首`)
      else if (done || failed) ui.toast(`下载结束：${done} 首成功，${failed} 首失败`)
    }
  }
})
