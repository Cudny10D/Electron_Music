import { Howl } from 'howler'
import pinia from '../store/pinia'
import { usePlayerStore } from '../store/playerStore'
import { useUserStore } from '../store/userStore'
import { useUiStore } from '../store/uiStore'
import { useSettingsStore } from '../store/settingsStore'
import { useHistoryStore } from '../store/historyStore'
import { checkMusic, getMusicUrl, getMusicUrlLegacy, getLyric, likeMusic } from '../api/song'
import { getLikelist } from '../api/user'
import { parseLyric, mergeTranslation, mergeRoma, findLyricIndex } from './lyric'
import { isLogin } from './authority'
import api from './windowApi'

const player = usePlayerStore(pinia)
const user = useUserStore(pinia)
const ui = useUiStore(pinia)
const settings = useSettingsStore(pinia)
const history = useHistoryStore(pinia)

let howl = null
let ticker = null
let loadToken = 0

// 请求音质不达标时（账号无该档权益）依次降级，最后兜底标准音质
const QUALITY_FALLBACK = {
  standard: ['standard'],
  higher: ['higher', 'standard'],
  exhigh: ['exhigh', 'standard'],
  lossless: ['lossless', 'exhigh', 'standard'],
  hires: ['hires', 'lossless', 'exhigh', 'standard']
}

/* ------------------------------ 内部工具 ------------------------------ */

function startTicker() {
  stopTicker()
  ticker = setInterval(() => {
    if (!howl) return
    let t = 0
    try {
      t = howl.seek() || 0
    } catch (err) {
      return
    }
    player.progress = t
    const idx = findLyricIndex(player.lyricLines, t)
    if (idx !== player.lyricIndex) player.lyricIndex = idx
  }, 200)
}

function stopTicker() {
  if (ticker) clearInterval(ticker)
  ticker = null
}

function syncTray(playing) {
  api.playOrPauseMusicCheck(playing)
}

function updateMediaSession(song) {
  if (!('mediaSession' in navigator) || !song) return
  const artists = (song.ar || []).map((a) => a.name).join(' / ')
  navigator.mediaSession.metadata = new MediaMetadata({
    title: song.name,
    artist: artists,
    album: song.al?.name || '',
    artwork: song.al?.picUrl ? [{ src: `${song.al.picUrl}?param=256y256`, sizes: '256x256', type: 'image/jpeg' }] : []
  })
}

function playUrl(url, autoplay = true) {
  if (howl) {
    howl.off()
    howl.unload()
    howl = null
  }

  howl = new Howl({
    src: [url],
    html5: true,
    format: ['mp3', 'flac'],
    autoplay,
    volume: player.volume,
    xhr: { method: 'GET', withCredentials: true },
    onplay() {
      player.playing = true
      player.loading = false
      if (settings.crossfade) {
        howl.volume(0)
        howl.fade(0, player.volume, 420)
      } else {
        howl.volume(player.volume)
      }
      startTicker()
      syncTray(true)
    },
    onpause() {
      player.playing = false
      stopTicker()
      syncTray(false)
    },
    onstop() {
      player.playing = false
      stopTicker()
      syncTray(false)
    },
    onend() {
      handleEnded()
    },
    onload() {
      player.loading = false
      try {
        player.duration = howl.duration() || 0
      } catch (err) {
        player.duration = 0
      }
    },
    onloaderror() {
      player.loading = false
      ui.toast('音频加载失败，已跳过', 'error')
      if (player.playMode !== 0) next(true)
    }
  })
}

function handleEnded() {
  player.playing = false
  stopTicker()

  if (player.playMode === 2) {
    howl?.seek(0)
    howl?.play()
    return
  }
  if (player.playMode === 0 && player.currentIndex >= player.songList.length - 1) {
    player.progress = 0
    return
  }
  next(true)
}

/* ------------------------------ 播放控制 ------------------------------ */

export function buildShuffled() {
  const list = [...player.songList]
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[list[i], list[j]] = [list[j], list[i]]
  }
  const current = player.currentSong
  if (current) {
    const idx = list.findIndex((song) => song.id === current.id)
    if (idx > 0) {
      list.splice(idx, 1)
      list.unshift(current)
    }
  }
  player.shuffledList = list
  player.shuffleIndex = 0
}

export function setPlayMode(mode) {
  player.playMode = mode
  if (mode === 3) buildShuffled()
  api.changeTrayMusicPlaymode(mode)
}

export function cyclePlayMode() {
  setPlayMode((player.playMode + 1) % 4)
}

async function loadLyric(id) {
  player.lyricLoading = true
  player.lyricLines = []
  try {
    const res = await getLyric(id)
    const lrc = res?.lrc?.lyric || ''
    const translation = res?.tlyric?.lyric || ''
    const roma = res?.romalrc?.lyric || ''
    player.lyric = res
    player.lyricLines = mergeRoma(mergeTranslation(parseLyric(lrc), translation), roma)
  } catch (err) {
    player.lyricLines = []
  } finally {
    player.lyricLoading = false
  }
}

/** 载入当前索引的歌曲（拉 url + 歌词） */
export async function load(autoplay = true) {
  const song = player.currentSong
  if (!song) return

  const token = ++loadToken
  player.songId = song.id
  player.progress = 0
  player.duration = 0
  player.lyricLines = []
  player.lyricIndex = -1
  player.loading = true

  // 本地文件：没有网易云 id，不查版权、不取流、不拉歌词，直接播 file:// 地址
  if (song.local && song.url) {
    player.loading = false
    playUrl(song.url, autoplay)
    history.push(song)
    updateMediaSession(song)
    const localTitle = `${song.name}${song.artist ? ` - ${song.artist}` : ''}`
    api.setWindowTitle(localTitle)
    api.setTraySong(localTitle)
    return
  }

  let checked = true
  try {
    const check = await checkMusic(song.id)
    checked = !!check?.success
  } catch (err) {
    checked = false
  }
  if (token !== loadToken) return

  // 登录后不再因 check 失败直接跳过：VIP / 会员权益只有取流接口能判定，
  // check/music 对会员曲目可能仍返回 false，提前 return 会导致“会员也放不了”。
  if (!checked && !isLogin()) {
    player.loading = false
    ui.toast('当前歌曲无版权，已跳过', 'error')
    return next(true)
  }

  let url = null
  let lastError = null

  // 音质逐级降级：选了无损 / Hi-Res 但账号没有对应权益时，
  // 接口会返回空地址，这里继续往下试，而不是直接判定“播放失败”。
  const levels = QUALITY_FALLBACK[player.quality] || ['exhigh', 'standard']
  for (const level of levels) {
    try {
      const res = await getMusicUrl(song.id, level)
      url = res?.data?.[0]?.url || null
    } catch (err) {
      lastError = err
      if (err?.response?.data?.code === -460) break
    }
    if (token !== loadToken) return
    if (url) break
  }

  // /song/url/v1 容易被判「网络环境存在风险」(-460)，退回旧接口再试一次
  if (!url) {
    try {
      const legacy = await getMusicUrlLegacy(song.id, player.quality)
      url = legacy?.data?.[0]?.url || null
    } catch (err) {
      if (!lastError) lastError = err
    }
  }

  if (token !== loadToken) return

  if (!url) {
    player.loading = false
    const code = lastError?.response?.data?.code
    const message = lastError?.response?.data?.message || ''
    if (!lastError) {
      ui.toast(
        song.vipOnly
          ? '该歌曲需要 VIP 会员；已开通请到登录页重新扫码同步权益'
          : '暂无播放地址（可能受版权或会员限制）',
        'error'
      )
    } else if (code === -460 || message.includes('风险')) {
      ui.toast('网易云风控拦截（-460），换个网络或稍后再试', 'error')
    } else if (!lastError.response) {
      ui.toast('连不上网易云 API（36530），请先启动服务', 'error')
    } else {
      ui.toast('获取播放地址失败', 'error')
    }
    return
  }

  playUrl(url, autoplay)
  history.push(song)
  updateMediaSession(song)
  const title = `${song.name} - ${(song.ar || []).map((a) => a.name).join('/')}`
  api.setWindowTitle(title)
  api.setTraySong(title)
  loadLyric(song.id)
}

/** 用一份新列表开始播放 */
export function playList(list, index = 0, info = null) {
  if (!Array.isArray(list) || !list.length) return
  player.songList = list
  player.currentIndex = Math.min(Math.max(index, 0), list.length - 1)
  player.listInfo = info
  if (player.playMode === 3) buildShuffled()
  load(true)
}

/** 播放列表里的某一首（列表已存在时） */
export function playAt(index) {
  if (index < 0 || index >= player.songList.length) return
  player.currentIndex = index
  if (player.playMode === 3) {
    const song = player.songList[index]
    const si = player.shuffledList.findIndex((item) => item.id === song.id)
    if (si >= 0) player.shuffleIndex = si
  }
  load(true)
}

export function toggle() {
  if (!howl) {
    if (player.songList.length) load(true)
    return
  }
  if (howl.playing()) howl.pause()
  else howl.play()
}

export function next(auto = false) {
  if (!player.songList.length) return
  if (player.playMode === 3 && player.shuffledList.length) {
    let i = player.shuffleIndex + 1
    if (i >= player.shuffledList.length) {
      if (auto && player.playMode === 0) return
      i = 0
    }
    player.shuffleIndex = i
    const song = player.shuffledList[i]
    const idx = player.songList.findIndex((item) => item.id === song.id)
    player.currentIndex = idx >= 0 ? idx : 0
  } else {
    let i = player.currentIndex + 1
    if (i >= player.songList.length) i = 0
    player.currentIndex = i
  }
  load(true)
}

export function prev() {
  if (!player.songList.length) return
  if (player.playMode === 3 && player.shuffledList.length) {
    let i = player.shuffleIndex - 1
    if (i < 0) i = player.shuffledList.length - 1
    player.shuffleIndex = i
    const song = player.shuffledList[i]
    const idx = player.songList.findIndex((item) => item.id === song.id)
    player.currentIndex = idx >= 0 ? idx : 0
  } else {
    let i = player.currentIndex - 1
    if (i < 0) i = player.songList.length - 1
    player.currentIndex = i
  }
  load(true)
}

export function seek(time) {
  const target = Math.max(0, Math.min(time, player.duration || time))
  player.progress = target
  if (howl) howl.seek(target)
  player.lyricIndex = findLyricIndex(player.lyricLines, target)
}

export function setVolume(value) {
  const v = Math.max(0, Math.min(1, Number(value)))
  player.volume = v
  if (howl) howl.volume(v)
}

export function addToNext(song) {
  if (!song || !player.songList.length) return
  const exist = player.songList.findIndex((item) => item.id === song.id)
  if (exist >= 0) player.songList.splice(exist, 1)
  const insertAt = player.currentIndex + 1
  player.songList.splice(insertAt, 0, song)
  if (exist >= 0 && exist <= player.currentIndex) player.currentIndex -= 1
}

export async function toggleLike(song) {
  if (!song) return
  if (!user.loggedIn) {
    ui.toast('请先登录网易云账号')
    return
  }
  const liked = user.likelist.includes(song.id)
  try {
    await likeMusic(song.id, !liked)
    const res = await getLikelist(user.user.userId)
    user.setLikelist(res.ids || [])
    ui.toast(liked ? '已取消喜欢' : '已加入我喜欢的音乐')
  } catch (err) {
    ui.toast('操作失败，请稍后重试', 'error')
  }
}

export function isLiked(song) {
  return !!song && user.likelist.includes(song.id)
}

/** 还原上次播放列表（不自动播放） */
export async function restoreLast() {
  const last = await api.getLastPlaylist()
  if (!last?.songList?.length) return
  player.songList = last.songList
  player.currentIndex = last.currentIndex ?? 0
  player.listInfo = last.listInfo ?? null
  player.songId = player.currentSong?.id ?? null
  if (player.playMode === 3) buildShuffled()
}

/** 注册托盘 / 全局快捷键 / 退出保存 */
export function initPlayerBridge() {
  api.playOrPauseMusic(() => toggle())
  api.lastOrNextMusic((event, option) => (option === 'last' ? prev() : next()))
  api.changeMusicPlaymode((event, mode) => setPlayMode(mode))
  api.volumeUp(() => setVolume(player.volume + 0.1))
  api.volumeDown(() => setVolume(player.volume - 0.1))
  api.musicProcessControl((event, mode) => seek(player.progress + (mode === 'forward' ? 3 : -3)))
  api.beforeQuit(() => {
    api.exitApp(
      JSON.stringify({
        songList: player.songList,
        currentIndex: player.currentIndex,
        listInfo: player.listInfo
      })
    )
  })

  if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('previoustrack', () => prev())
    navigator.mediaSession.setActionHandler('nexttrack', () => next())
    navigator.mediaSession.setActionHandler('play', () => toggle())
    navigator.mediaSession.setActionHandler('pause', () => toggle())
  }

  setInterval(() => {
    if (player.songList.length) {
      api.saveLastPlaylist(
        JSON.stringify({
          songList: player.songList,
          currentIndex: player.currentIndex,
          listInfo: player.listInfo
        })
      )
    }
  }, 15000)
}
