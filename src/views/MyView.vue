<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '../store/userStore'
import { useLibraryStore } from '../store/libraryStore'
import { useDownloadStore } from '../store/downloadStore'
import { useLocalStore } from '../store/localStore'
import { useHistoryStore } from '../store/historyStore'
import { useUiStore } from '../store/uiStore'
import { getUserPlaylist } from '../api/user'
import { getPlaylistDetail, getPlaylistAll } from '../api/playlist'
import { getUserSubAlbum, getUserSubMV } from '../api/album'
import { getUserSubArtists } from '../api/artist'
import { mapSongsPlayableStatus } from '../utils/songStatus'
import { playList } from '../utils/player'
import { downloadSongs } from '../utils/download'
import { formatBytes, formatDate } from '../utils/format'
import DownloadPanel from '../components/DownloadPanel.vue'
import LocalMusicPanel from '../components/LocalMusicPanel.vue'
import PlaylistManager from '../components/PlaylistManager.vue'
import ShareButton from '../components/ShareButton.vue'
import SongTable from '../components/SongTable.vue'
import Icon from '../components/Icon.vue'

const route = useRoute()
const router = useRouter()
const user = useUserStore()
const library = useLibraryStore()
const downloads = useDownloadStore()
const local = useLocalStore()
const history = useHistoryStore()
const ui = useUiStore()

/**
 * 参考 Hydrogen MyMusic：左栏 = 两级标签（LibraryType）+ 带缩略图的条目列表，
 * 右栏 = 选中歌单的详情（封面 / 标题 / 播放全部 / 歌曲表），未选中时是 NONE 画框。
 * 一级标签按参考图收敛成「歌单 / 收藏 / 历史 / 下载管理 / 本地管理」五项；
 * 「历史」已并入本页（原顶栏独立路由 /history 保留作兼容），「设置」在头像下拉菜单。
 */
const TABS = [
  { id: 'playlists', label: '歌单', en: 'PLAYLISTS', cap: 'CREATED / 我创建的歌单' },
  { id: 'collected', label: '收藏', en: 'COLLECTED', cap: 'SUBSCRIBED / 我收藏的歌单' },
  { id: 'history', label: '历史', en: 'HISTORY', cap: 'RECENT / 最近播放' },
  { id: 'downloads', label: '下载管理', en: 'DOWNLOADS', cap: 'TASKS / 下载任务' },
  { id: 'local', label: '本地管理', en: 'LOCAL', cap: 'FOLDERS / 目录与歌曲' }
]

/** 二级标签（Hydrogen 的 type-two）：下载管理按参考图只有「正在下载 / 下载完成」 */
const SUB_TABS = {
  playlists: [
    { id: 'created', label: '我创建的' },
    { id: 'subscribed', label: '我收藏的' }
  ],
  // 收藏按 Hydrogen 资料库收敛成「专辑 / 歌手 / MV」，歌单收藏仍从「歌单」进入
  collected: [
    { id: 'album', label: '专辑' },
    { id: 'artist', label: '歌手' },
    { id: 'mv', label: 'MV' }
  ],
  downloads: [
    { id: 'active', label: '正在下载' },
    { id: 'done', label: '下载完成' }
  ],
  local: [
    { id: 'all', label: '全部' },
    { id: 'download', label: '下载目录' },
    { id: 'folders', label: '扫描目录' }
  ]
}

/** 未完成的下载任务（含失败 / 取消，便于重试）都归到「正在下载」 */
const ACTIVE_DL = ['queued', 'fetching', 'downloading', 'error', 'canceled']

const tab = computed(() => (TABS.some((t) => t.id === route.query.tab) ? route.query.tab : 'playlists'))
const currentTab = computed(() => TABS.find((t) => t.id === tab.value) || TABS[0])
const subTabs = computed(() => SUB_TABS[tab.value] || [])
const sub = ref('')
const currentSubLabel = computed(() => subTabs.value.find((s) => s.id === sub.value)?.label || '')

/** 左栏当前选中的条目，Hydrogen 的 list-item-selected */
const selectedKey = ref('')

function setTab(id) {
  router.replace({ path: '/my', query: id === 'playlists' ? {} : { tab: id } })
}

function setSub(id) {
  sub.value = id
  selectedKey.value = ''
  detailId.value = ''
  nextTick(autoSelect)
}

function tabCount(id) {
  if (id === 'downloads') return downloads.pendingCount
  if (id === 'local') return local.files.length
  if (id === 'history') return history.count
  if (id === 'collected') return collectedAlbums.value.length + collectedArtists.value.length + collectedMvs.value.length
  return 0
}

const viewCount = computed(() => {
  const t = tab.value
  if (t === 'playlists') return `${sideItems.value.length} PLAYLISTS`
  if (t === 'collected') {
    const n = sub.value === 'artist' ? collectedArtists.value.length
      : sub.value === 'mv' ? collectedMvs.value.length
      : collectedAlbums.value.length
    return `${n} ${currentSubLabel.value.toUpperCase() || 'ITEMS'}`
  }
  if (t === 'history') return `${history.count} TRACKS`
  if (t === 'downloads') return `${downloads.tasks.length} TASKS`
  return `${local.files.length} TRACKS`
})

async function refresh() {
  if (tab.value === 'playlists' || tab.value === 'collected') {
    await loadMy()
    if (tab.value === 'collected') await loadCollected()
    if (!detailId.value) autoSelect()
  } else if (tab.value === 'local') await local.scan()
  else ui.toast('已刷新')
}

/* ---- 一级标签下划线滑块（与顶栏 nav__bar 同一手法） ---- */
const navEl = ref(null)
const trackerStyle = ref({ width: '0px', transform: 'translateX(0px)' })
const trackerReady = ref(false)

/* ---- 右栏歌单详情（Hydrogen 的 library-view） ----
   必须在 immediate 的 watch(tab) 之前声明：回调会同步重置 detailId，
   放在后面会触发 "Cannot access before initialization"（TDZ）。 */
const detailId = ref('') // '' = 未选中；'likes' = 我喜欢的音乐；其余是歌单 / 专辑 id
const detailKind = ref('playlist') // playlist | likes | album
const detailInfo = ref(null)
const detailSongs = ref([])
const detailLoading = ref(false)
const detailError = ref('')
let detailSeq = 0 // 快速点选时丢弃过期请求

const detailCover = computed(() => detailInfo.value?.coverImgUrl || detailInfo.value?.picUrl || '')
const detailCreator = computed(() =>
  detailInfo.value?.creator?.nickname || detailInfo.value?.artist?.name || '网易云'
)
const detailCount = computed(() => detailSongs.value.length || detailInfo.value?.trackCount || detailInfo.value?.size || 0)
const detailCreated = computed(() => {
  const t = detailInfo.value?.createTime || detailInfo.value?.publishTime
  return t ? formatDate(new Date(t)) : ''
})
const detailContext = computed(() => ({ kind: detailKind.value, name: detailInfo.value?.name || '我的音乐' }))

/* ---- 历史右栏：与顶栏 HistoryView 一致的最近播放表 ---- */
const historySongs = computed(() =>
  history.items.map((s) => ({ ...s, ar: s.ar || [], al: s.al || {} }))
)
const historyContext = { kind: 'history', name: '播放历史' }
function clearHistory() {
  history.clear()
  ui.toast('播放历史已清空')
}

function syncTracker() {
  const nav = navEl.value
  if (!nav) return
  const active = nav.querySelector('.library__item.is-active')
  if (!active) return
  trackerStyle.value = {
    width: `${active.offsetWidth}px`,
    transform: `translateX(${active.offsetLeft}px)`
  }
}

watch(
  tab,
  () => {
    sub.value = subTabs.value[0]?.id || ''
    selectedKey.value = ''
    detailId.value = ''
    if (tab.value === 'collected') loadCollected()
    nextTick(() => {
      syncTracker()
      autoSelect()
    })
  },
  { immediate: true }
)

// 切收藏的二级标签（专辑/歌手/MV）时清空详情，等新列表加载
watch(sub, () => {
  detailId.value = ''
  selectedKey.value = ''
})

const created = ref([])
const subscribed = ref([])
const likesCover = ref('')
const loading = ref(false)
const dialog = ref(false)

/** 收藏分区（Hydrogen LibraryType 的「收藏」）：专辑 / 歌手 / MV 三套真实数据 */
const collectedAlbums = ref([])
const collectedArtists = ref([])
const collectedMvs = ref([])
const collectedLoading = ref(false)

async function loadCollected() {
  if (!user.loggedIn) return
  collectedLoading.value = true
  try {
    const [albums, artists, mvs] = await Promise.all([
      getUserSubAlbum({ limit: 100, offset: 0 }).catch(() => ({ data: [] })),
      getUserSubArtists().catch(() => ({ data: [] })),
      getUserSubMV({ limit: 100, offset: 0 }).catch(() => ({ data: [] }))
    ])
    collectedAlbums.value = albums?.data || []
    collectedArtists.value = artists?.data || []
    collectedMvs.value = mvs?.data || []
  } finally {
    collectedLoading.value = false
  }
}

const likesCount = computed(() => user.likelist.length)
const createdFiltered = computed(() => created.value.filter((p) => p.specialType !== 5))
const playlistItems = computed(() => {
  if (tab.value === 'collected') return subscribed.value
  return sub.value === 'subscribed' ? subscribed.value : createdFiltered.value
})

const DL_STATUS = {
  queued: '等待中',
  fetching: '获取地址',
  downloading: '下载中',
  done: '已完成',
  error: '失败',
  canceled: '已取消'
}
const recentTasks = computed(() => {
  if (tab.value !== 'downloads') return downloads.tasks.slice(0, 4)
  const list =
    sub.value === 'done'
      ? downloads.tasks.filter((x) => x.status === 'done')
      : downloads.tasks.filter((x) => ACTIVE_DL.includes(x.status))
  return list.slice(0, 4)
})

function dlStatusText(task) {
  if (task.status === 'error') return task.error || '下载失败'
  if (task.status === 'downloading') {
    const size = task.total ? ` · ${formatBytes(task.loaded)} / ${formatBytes(task.total)}` : ''
    return `${task.progress}%${size}`
  }
  if (task.status === 'done') return task.size ? formatBytes(task.size) : '已完成'
  return DL_STATUS[task.status] || ''
}

const pad = (n) => String(n).padStart(2, '0')
const sideCap = computed(() => {
  if (tab.value === 'collected') {
    return { album: 'ALBUMS / 收藏的专辑', artist: 'ARTISTS / 收藏的歌手', mv: 'MV / 收藏的视频' }[sub.value] || 'COLLECTED'
  }
  return TABS.find((t) => t.id === tab.value)?.cap || ''
})

/** 左栏条目列表：Hydrogen 的 LibraryList / DownloadList / LocalMusicList 合并版 */
const sideItems = computed(() => {
  const t = tab.value
  if (t === 'playlists') {
    const likes = {
      key: 'p-likes',
      name: '我喜欢的音乐',
      sub: `${likesCount.value} 首`,
      cover: likesCover.value,
      tag: 'FAV',
      action: { type: 'likes' }
    }
    const rows = playlistItems.value.map((p) => ({
      key: `p-${p.id}`,
      name: p.name,
      sub: `${p.trackCount ?? 0} 首`,
      cover: p.coverImgUrl || '',
      tag: 'PL',
      action: { type: 'playlist', id: p.id },
      playlist: p
    }))
    return [likes, ...rows]
  }
  // 收藏区按 Hydrogen LibraryType：左栏是收藏的专辑 / 歌手 / MV 列表
  if (t === 'collected') {
    if (sub.value === 'artist') {
      return collectedArtists.value.map((a) => ({
        key: `ca-${a.id}`,
        name: a.name,
        sub: a.alias?.length ? `歌手 · ${a.alias.slice(0, 2).join(' / ')}` : '歌手',
        cover: a.img1v1Url || a.picUrl || '',
        tag: 'AR',
        round: true,
        action: { type: 'artist', id: a.id, item: a }
      }))
    }
    if (sub.value === 'mv') {
      return collectedMvs.value.map((m) => ({
        key: `cm-${m.id}`,
        name: m.name,
        sub: `${(m.artists || []).map((x) => x.name).join(' / ') || m.artistName || 'MV'} · ${formatDate(new Date(m.publishTime))}`,
        cover: m.imgurl || m.cover || '',
        tag: 'MV',
        action: { type: 'mv', id: m.id, item: m }
      }))
    }
    return collectedAlbums.value.map((a) => ({
      key: `cb-${a.id}`,
      name: a.name,
      sub: `${a.artist?.name || '专辑'} · ${a.size ?? 0} 首`,
      cover: a.picUrl || '',
      tag: 'AL',
      action: { type: 'album', id: a.id, item: a }
    }))
  }
  if (t === 'history') {
    return history.items.map((s) => ({
      key: `h-${s.id}-${s.playedAt}`,
      name: s.name,
      sub: `${(s.ar || []).map((a) => a.name).join(' / ') || s.artist || '未知'} · ${formatDate(new Date(s.playedAt))}`,
      cover: s.al?.picUrl || '',
      tag: 'HIS',
      action: { type: 'history', song: s }
    }))
  }
  if (t === 'downloads') {
    const list =
      sub.value === 'done'
        ? downloads.tasks.filter((x) => x.status === 'done')
        : downloads.tasks.filter((x) => ACTIVE_DL.includes(x.status))
    return list.map((x) => ({
      key: `d-${x.id}`,
      name: x.name,
      sub: `${DL_STATUS[x.status] || x.status}${x.progress ? ` · ${x.progress}%` : ''}`,
      cover: '',
      tag: x.status === 'done' ? 'OK' : x.status === 'error' ? '!' : 'DL',
      action: { type: 'download' }
    }))
  }
  if (t === 'local') {
    let files = local.files
    if (sub.value === 'download') files = files.filter((f) => f.source === 'download')
    if (sub.value === 'folders') files = files.filter((f) => f.source === 'local')
    const dirs =
      sub.value === 'download'
        ? []
        : local.folders.map((d) => ({
            key: `f-${d}`,
            name: String(d).split(/[\\/]/).filter(Boolean).pop() || d,
            sub: '扫描目录',
            cover: '',
            tag: 'DIR',
            action: { type: 'folder', dir: d }
          }))
    const rows = files.slice(0, 24).map((f) => ({
      key: `t-${f.path}`,
      name: f.name,
      sub: f.artist || '本地音频',
      cover: '',
      tag: (f.ext || '—').replace('.', '').toUpperCase().slice(0, 3),
      action: { type: 'local', file: f }
    }))
    return [...dirs, ...rows]
  }
  return []
})

function onSideItem(item) {
  selectedKey.value = item.key
  const a = item.action
  if (a.type === 'likes') openLikes()
  else if (a.type === 'playlist') openPlaylist(a.id, item.playlist)
  else if (a.type === 'artist') router.push(`/artist/${a.id}`)
  else if (a.type === 'mv') {
    const url = `https://music.163.com/mv?id=${a.id}`
    window.open(url, '_blank', 'noopener')
    ui.toast('MV 已在浏览器中打开')
  }
  else if (a.type === 'album') openAlbum(a.id, a.item)
  else if (a.type === 'history') {
    const list = historySongs.value
    playList(list, list.findIndex((s) => s.id === a.song.id), historyContext)
  }
  else if (a.type === 'download') ui.toggleDownloads(true)
  else if (a.type === 'local') local.playFile(a.file, local.files)
  else if (a.type === 'folder') ui.toast(`目录：${a.dir}`)
}

/** 进入分区时默认选中第一条，复现参考图「左栏高亮 + 右栏详情」的状态 */
function autoSelect() {
  if (tab.value !== 'playlists' && tab.value !== 'collected') return
  if (!user.loggedIn) return
  const first = sideItems.value[0]
  if (!first) {
    detailId.value = ''
    return
  }
  // 收藏的歌手/MV 是跳转项，不自动触发；只自动展开专辑/歌单详情
  if (tab.value === 'collected' && !['album'].includes(sub.value)) return
  selectedKey.value = first.key
  onSideItem(first)
}

/** 点左栏歌单：右栏原地展开详情与歌曲表，不再跳独立详情页 */
async function openPlaylist(id, fallback) {
  const seq = ++detailSeq
  detailKind.value = 'playlist'
  detailId.value = String(id)
  detailLoading.value = true
  detailError.value = ''
  detailInfo.value = fallback || { id, name: '歌单', trackCount: 0 }
  detailSongs.value = []
  try {
    const params = { id, limit: 1000, offset: 0 }
    const [detail, all] = await Promise.all([getPlaylistDetail(params), getPlaylistAll(params)])
    if (seq !== detailSeq) return
    detailInfo.value = detail?.playlist || detailInfo.value
    detailSongs.value = mapSongsPlayableStatus(all?.songs || [], all?.privileges) || []
  } catch (err) {
    if (seq !== detailSeq) return
    detailError.value = '歌曲列表加载失败，可点「查看详情」打开完整页面'
  } finally {
    if (seq === detailSeq) detailLoading.value = false
  }
}

/** 收藏专辑：右栏展开专辑详情与歌曲表，复用歌单详情的渲染结构 */
async function openAlbum(id, fallback) {
  const seq = ++detailSeq
  detailKind.value = 'album'
  detailId.value = String(id)
  detailLoading.value = true
  detailError.value = ''
  detailInfo.value = fallback || { id, name: '专辑' }
  detailSongs.value = []
  try {
    await library.loadAlbum(id)
    if (seq !== detailSeq) return
    detailInfo.value = library.info || detailInfo.value
    detailSongs.value = library.songs || []
  } catch (err) {
    if (seq !== detailSeq) return
    detailError.value = '专辑加载失败'
  } finally {
    if (seq === detailSeq) detailLoading.value = false
  }
}

async function openLikes() {
  const seq = ++detailSeq
  detailKind.value = 'likes'
  detailId.value = 'likes'
  detailLoading.value = true
  detailError.value = ''
  detailInfo.value = {
    id: 'likes',
    name: '我喜欢的音乐',
    coverImgUrl: likesCover.value,
    creator: { nickname: user.user?.nickname || '我' },
    trackCount: likesCount.value
  }
  detailSongs.value = []
  try {
    await library.loadLikes(user.likelist)
    if (seq !== detailSeq) return
    detailInfo.value = library.info || detailInfo.value
    detailSongs.value = library.songs || []
  } catch (err) {
    if (seq !== detailSeq) return
    detailError.value = '喜欢的音乐加载失败'
  } finally {
    if (seq === detailSeq) detailLoading.value = false
  }
}

function playAllDetail() {
  const playable = detailSongs.value.filter((s) => s.playable !== false)
  if (!playable.length) return ui.toast('这个歌单暂时没有可播放的歌曲')
  playList(playable, 0, detailContext.value)
}

function downloadDetail() {
  if (!detailSongs.value.length) return ui.toast('没有可下载的歌曲')
  downloadSongs(detailSongs.value)
}

async function loadMy() {
  if (!user.loggedIn) return
  loading.value = true
  try {
    const res = await getUserPlaylist({ uid: user.user.userId, limit: 1000 })
    const all = res.playlist || []
    created.value = all.filter((p) => p.creator?.userId === user.user.userId)
    subscribed.value = all.filter((p) => p.creator?.userId !== user.user.userId)
    likesCover.value = all.find((p) => p.specialType === 5)?.coverImgUrl || ''
  } catch (err) {
    created.value = []
    subscribed.value = []
  } finally {
    loading.value = false
    if ((tab.value === 'playlists' || tab.value === 'collected') && !detailId.value) nextTick(autoSelect)
  }
}

function onPlaylistSaved() {
  dialog.value = false
  loadMy()
}

onMounted(() => {
  loadMy()
  nextTick(() => {
    syncTracker()
    requestAnimationFrame(() => (trackerReady.value = true))
  })
  window.addEventListener('resize', syncTracker)
  document.fonts?.ready?.then(syncTracker)
})

onBeforeUnmount(() => window.removeEventListener('resize', syncTracker))
</script>

<template>
  <div class="my hb-page">
    <!-- 身份条：Hydrogen 的资料库页不放大头像，压成一条细线 -->
    <div v-if="user.loggedIn" class="my__id">
      <span class="hb-label">MY MUSIC</span>
      <span class="my__id-name">{{ user.user?.nickname }}</span>
      <span class="my__id-stats hb-mono">
        {{ createdFiltered.length }} 个歌单 <i>·</i> {{ subscribed.length }} 个收藏 <i>·</i> {{ likesCount }} 首喜欢
      </span>
    </div>

    <div
      class="my__layout"
      :class="{ 'is-nologin': !user.loggedIn && (tab === 'playlists' || tab === 'collected') }"
    >
      <!-- 左栏：music-library（两级类型 + 条目列表） -->
      <aside v-if="user.loggedIn || (tab !== 'playlists' && tab !== 'collected')" class="library hb-acrylic">
        <div class="library__cap hb-mono">LIBRARY / 资料库</div>

        <!-- 一级：横向分区 + 下划线滑块 -->
        <div class="library__types">
          <nav ref="navEl" class="library__nav" aria-label="我的音乐分区">
            <button
              v-for="(t, i) in TABS"
              :key="t.id"
              class="library__item"
              :class="{ 'is-active': tab === t.id }"
              @click="setTab(t.id)"
            >
              <span class="library__idx hb-mono">{{ pad(i + 1) }}</span>
              <span class="library__label">{{ t.label }}</span>
              <span class="library__en hb-mono">{{ t.en }}</span>
              <span v-if="tabCount(t.id)" class="library__count hb-mono">{{ tabCount(t.id) }}</span>
            </button>
          </nav>
          <div class="library__track">
            <span class="library__bar" :class="{ 'is-ready': trackerReady }" :style="trackerStyle" />
          </div>
        </div>

        <!-- 二级：子视图 + 刷新 -->
        <div v-if="subTabs.length" class="library__subs">
          <button
            v-for="s in subTabs"
            :key="s.id"
            class="library__sub"
            :class="{ 'is-active': sub === s.id }"
            @click="setSub(s.id)"
          >
            {{ s.label }}
          </button>
          <button class="library__refresh hb-mono" title="刷新" @click="refresh">
            <Icon name="refresh" :size="10" />
            刷新
          </button>
        </div>

        <!-- 条目列表：缩略图 + 名称 + 副标题 -->
        <div class="library__list hb-scroll">
          <div class="library__list-cap hb-mono">{{ sideCap }}</div>
          <div class="library__list-body">
            <button
              v-for="(item, i) in sideItems"
              :key="item.key"
              class="library__row"
              :class="{ 'is-selected': selectedKey === item.key }"
              @click="onSideItem(item)"
            >
              <span class="library__thumb" :class="{ 'is-round': item.round }">
                <img v-if="item.cover" :src="`${item.cover}?param=80y80`" alt="" />
                <span v-else class="library__thumb-tag hb-mono">{{ item.tag }}</span>
              </span>
              <span class="library__row-main">
                <span class="library__row-name hb-clamp-1">{{ item.name }}</span>
                <span class="library__row-sub hb-clamp-1">{{ item.sub }}</span>
              </span>
              <span class="library__row-idx hb-mono">{{ pad(i + 1) }}</span>
            </button>
            <p v-if="!sideItems.length" class="library__none hb-mono">NO ITEMS</p>
          </div>
        </div>
      </aside>

      <!-- 右栏：library-view。key 只跟一级板块走，切板块时仅重建这一块，
           做局部模糊淡入（无位移）；整页不再因 query 变化触发 page 过渡。 -->
      <main :key="tab" class="library-view">
        <header class="view-head" :class="{ 'is-compact': tab !== 'playlists' && tab !== 'collected' }">
          <span class="hb-label">{{ currentTab.en }}</span>
          <h1 class="view-head__title hb-display">{{ currentTab.label }}</h1>
          <span class="view-head__line" />
          <span class="hb-mono hb-muted">{{ viewCount }}</span>
          <span v-if="currentSubLabel" class="view-head__sub hb-mono">/ {{ currentSubLabel }}</span>
          <button
            v-if="user.loggedIn && tab === 'playlists'"
            class="hb-btn my__create"
            @click="dialog = true"
          >
            <Icon name="plus" :size="12" />
            新建歌单
          </button>
        </header>

        <!-- 未登录看歌单 / 收藏时给登录引导；下载管理、本地管理不依赖登录 -->
        <section v-if="!user.loggedIn && (tab === 'playlists' || tab === 'collected')" class="guest">
          <div class="guest__main">
            <span class="hb-label">ACCOUNT</span>
            <h1 class="guest__title hb-display">还没有登录</h1>
            <p class="guest__desc">登录后可以查看我喜欢的音乐、收藏的歌单与每日推荐。</p>
            <button class="hb-btn hb-btn--solid" @click="router.push('/login')">扫码登录</button>
          </div>

          <ol class="guest__list">
            <li class="guest__item">
              <span class="guest__num hb-mono">01</span>
              <span class="guest__label">每日推荐</span>
              <span class="guest__note">按你的口味每天 6:00 生成</span>
            </li>
            <li class="guest__item">
              <span class="guest__num hb-mono">02</span>
              <span class="guest__label">我喜欢的音乐</span>
              <span class="guest__note">与手机端的红心保持同步</span>
            </li>
            <li class="guest__item">
              <span class="guest__num hb-mono">03</span>
              <span class="guest__label">收藏的歌单</span>
              <span class="guest__note">你在网易云收藏的全部歌单</span>
            </li>
          </ol>
        </section>

        <template v-else>
          <!-- 歌单 / 收藏：Hydrogen 式「左栏选中 → 右栏详情 + 歌曲表」。
               收藏的左栏是专辑 / 歌手 / MV，选中专辑时同样展开详情，歌手/MV 走独立页。 -->
          <template v-if="tab === 'playlists' || tab === 'collected'">
            <Transition name="detail-fade" mode="out-in">
            <div :key="detailId || `none-${sub}`" v-if="detailId" class="detail-switch">
              <header class="pl-head">
                <div
                  class="pl-head__cover hb-frame"
                  :style="detailCover ? { backgroundImage: `url(${detailCover}?param=400y400)` } : null"
                >
                  <Icon v-if="!detailCover" name="heart" :size="34" />
                </div>

                <div class="pl-head__meta">
                  <span class="hb-label">{{ detailId === 'likes' ? 'FAVORITES' : detailKind === 'album' ? 'ALBUM' : 'PLAYLIST' }}</span>
                  <h2 class="pl-head__title hb-display hb-clamp-2">{{ detailInfo?.name || '歌单' }}</h2>
                  <div class="pl-head__sub hb-mono">{{ detailCreator }} <i>·</i> 共 {{ detailCount }} 首</div>
                  <div class="pl-head__acts">
                    <button class="hb-btn hb-btn--solid" @click="playAllDetail">
                      <Icon name="play" :size="12" /> 播放全部
                    </button>
                    <button class="hb-btn" @click="downloadDetail">
                      <Icon name="download" :size="12" /> 下载
                    </button>
                    <ShareButton
                      v-if="detailId !== 'likes' && detailInfo?.id"
                      :type="detailKind === 'album' ? 'album' : 'playlist'"
                      :item="detailInfo"
                      compact
                      :label="detailKind === 'album' ? '分享专辑' : '分享歌单'"
                    />
                  </div>
                </div>

                <div class="pl-head__side">
                  <span v-if="detailCreated" class="pl-head__date hb-mono">创建时间 {{ detailCreated }}</span>
                  <button
                    v-if="detailId !== 'likes'"
                    class="hb-btn"
                    @click="router.push(detailKind === 'album' ? `/album/${detailId}` : `/playlist/${detailId}`)"
                  >
                    查看详情
                  </button>
                </div>
              </header>

              <div class="hb-section pl-section">
                <span class="hb-label">TRACKS</span>
                <h2 class="hb-section__title">歌曲列表</h2>
                <span class="hb-section__line" />
                <span class="hb-mono hb-muted">{{ detailSongs.length }}</span>
                <span class="pl-section__state hb-mono">{{ detailLoading ? 'LOADING' : 'PLAYALL' }}</span>
              </div>

              <SongTable v-if="detailSongs.length" :songs="detailSongs" :context="detailContext" />
              <div v-else class="empty lib-none" aria-label="暂无歌曲">
                <span class="lib-none__corner is-tl" />
                <span class="lib-none__corner is-tr" />
                <span class="lib-none__corner is-bl" />
                <span class="lib-none__corner is-br" />
                <span class="lib-none__diag is-a" />
                <span class="lib-none__diag is-b" />
                <span class="lib-none__tip hb-mono">{{ detailLoading ? 'LOADING' : detailError ? 'OFFLINE' : 'NONE' }}</span>
              </div>
              <p v-if="detailError" class="pl-error hb-mono">{{ detailError }}</p>
            </div>

            <!-- 未选中条目 / 无收藏：Hydrogen 的 NONE 画框 -->
            <div v-else key="none" class="empty lib-none lib-none--full" aria-label="未选择条目">
              <span class="lib-none__corner is-tl" />
              <span class="lib-none__corner is-tr" />
              <span class="lib-none__corner is-bl" />
              <span class="lib-none__corner is-br" />
              <span class="lib-none__diag is-a" />
              <span class="lib-none__diag is-b" />
              <span class="lib-none__tip hb-mono">{{ loading ? 'LOADING' : 'NONE' }}</span>
            </div>
            </Transition>
          </template>

          <!-- 历史：最近播放，可整表播放 / 清空 -->
          <template v-else-if="tab === 'history'">
            <section class="section history-section">
              <div class="hb-section history-head">
                <span class="hb-label">HISTORY / 播放历史</span>
                <h2 class="hb-section__title">最近播放</h2>
                <span class="hb-section__line" />
                <span class="hb-mono hb-muted">{{ history.count }} TRACKS</span>
                <button class="hb-btn" :disabled="!history.count" @click="clearHistory">
                  <Icon name="refresh" :size="12" />
                  清空
                </button>
              </div>

              <SongTable
                v-if="historySongs.length"
                :songs="historySongs"
                :context="historyContext"
              />
              <div v-else class="empty lib-none" aria-label="暂无播放记录">
                <span class="lib-none__corner is-tl" />
                <span class="lib-none__corner is-tr" />
                <span class="lib-none__corner is-bl" />
                <span class="lib-none__corner is-br" />
                <span class="lib-none__diag is-a" />
                <span class="lib-none__diag is-b" />
                <span class="lib-none__tip hb-mono">NO HISTORY</span>
              </div>
            </section>
          </template>

          <!-- 下载 -->
          <template v-else-if="tab === 'downloads'">
            <section class="section dl-section">
              <div class="hb-section dl-head">
                <span class="hb-label">DOWNLOADS</span>
                <h2 class="hb-section__title">任务概览</h2>
                <span class="hb-section__line" />
                <span class="hb-mono hb-muted">{{ downloads.tasks.length }}</span>
                <div class="dl-head__acts">
                  <button class="hb-btn" @click="downloads.openFolder()">
                    <Icon name="folder" :size="12" />
                    打开目录
                  </button>
                  <button class="hb-btn" @click="ui.toggleDownloads(true)">
                    <Icon name="download" :size="12" />
                    浮层查看
                  </button>
                </div>
              </div>

              <div class="dl-card hb-acrylic" :class="{ 'is-busy': downloads.hasActive }">
                <div class="dl-card__stats">
                  <div class="dl-stat">
                    <span class="dl-stat__num hb-mono">{{ downloads.doneCount }}</span>
                    <span class="dl-stat__label hb-label">已完成</span>
                  </div>
                  <div class="dl-stat" :class="{ 'is-accent': downloads.pendingCount }">
                    <span class="dl-stat__num hb-mono">{{ downloads.pendingCount }}</span>
                    <span class="dl-stat__label hb-label">进行中</span>
                  </div>
                  <div class="dl-stat" :class="{ 'is-danger': downloads.failedCount }">
                    <span class="dl-stat__num hb-mono">{{ downloads.failedCount }}</span>
                    <span class="dl-stat__label hb-label">失败</span>
                  </div>

                  <div v-if="downloads.tasks.length" class="dl-card__progress">
                    <div class="dl-card__progress-top hb-mono">
                      <span>整体进度</span>
                      <span>{{ downloads.overallPercent }}%</span>
                    </div>
                    <div class="dl-card__track">
                      <div class="dl-card__fill" :style="{ width: `${downloads.overallPercent}%` }" />
                    </div>
                  </div>
                </div>

                <div v-if="recentTasks.length" class="dl-rows">
                  <button
                    v-for="task in recentTasks"
                    :key="task.id"
                    class="dl-row"
                    :class="`is-${task.status}`"
                    @click="ui.toggleDownloads(true)"
                  >
                    <span class="dl-row__icon" :class="`is-${task.status}`">
                      <Icon v-if="task.status === 'done'" name="check" :size="13" />
                      <Icon v-else-if="task.status === 'downloading' || task.status === 'fetching'" name="download" :size="13" />
                      <Icon v-else-if="task.status === 'error'" name="close" :size="13" />
                      <span v-else class="dl-row__dot" />
                    </span>
                    <span class="dl-row__main">
                      <span class="dl-row__name hb-clamp-1">{{ task.name }}</span>
                      <span class="dl-row__artist hb-clamp-1">{{ task.artist || '—' }}</span>
                    </span>
                    <span class="dl-row__text hb-mono hb-clamp-1" :class="{ 'is-error': task.status === 'error' }">
                      {{ dlStatusText(task) }}
                    </span>
                    <span class="dl-row__arrow"><Icon name="chevron-right" :size="13" /></span>
                    <span v-if="task.status === 'downloading' || task.status === 'done'" class="dl-row__track">
                      <span class="dl-row__fill" :style="{ width: `${task.progress}%` }" />
                    </span>
                  </button>
                  <p v-if="downloads.tasks.length > recentTasks.length" class="dl-more hb-mono">
                    还有 {{ downloads.tasks.length - recentTasks.length }} 首 · 完整列表见下方
                  </p>
                </div>

                <div v-else class="dl-empty">
                  <Icon name="download" :size="26" />
                  <p>还没有下载任务</p>
                  <span>在歌曲列表点下载，或用歌单详情页的「下载全部」</span>
                </div>
              </div>
            </section>

            <div class="my__panel-cap hb-label">ALL TASKS / 全部任务</div>
            <DownloadPanel embedded />
          </template>

          <!-- 本地管理 -->
          <LocalMusicPanel v-else-if="tab === 'local'" />
        </template>
      </main>
    </div>

    <Transition name="dlg">
      <PlaylistManager v-if="dialog" mode="create" @close="dialog = false" @saved="onPlaylistSaved" />
    </Transition>
  </div>
</template>

<style scoped lang="scss">
.my {
}

/* 身份条 */
.my__id {
  display: flex;
  align-items: center;
  gap: 14px;
  padding-bottom: 14px;
  margin-bottom: 22px;
  border-bottom: 1px solid var(--line);

  &-name {
    font-size: 14px;
    color: var(--ink);
  }

  &-stats {
    font-size: 9px;
    color: var(--faint);

    i {
      font-style: normal;
      opacity: 0.6;
      padding: 0 3px;
    }
  }

  &-logout {
    margin-left: auto;
    height: 26px;
  }
}

/* 两栏：262px 资料库 + 50px 间隔（Hydrogen MyMusic 的读法） */
.my__layout {
  display: grid;
  grid-template-columns: 262px minmax(0, 1fr);
  gap: 50px;
  align-items: start;

  &.is-nologin {
    grid-template-columns: minmax(0, 1fr);
    gap: 0;
  }
}

.library {
  position: sticky;
  top: calc(var(--titlebar) + 16px);
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - var(--titlebar) - var(--player) - 56px);
  min-height: 420px;
  background: var(--glass-panel);
  border: 1px solid var(--line);
  box-shadow: inset 0 1px 0 var(--glass-edge);

  &__cap {
    flex: none;
    padding: 12px 14px 10px;
    border-bottom: 1px solid var(--line);
    font-size: 8px;
    letter-spacing: 0.16em;
    color: var(--faint);
  }

  /* ---- 一级：横向标签 + tracker ---- */
  &__types {
    flex: none;
    padding: 8px 8px 0;
    border-bottom: 1px solid var(--line);
  }

  &__nav {
    position: relative; /* 让 .library__item 的 offsetLeft 相对 nav，与 track 左边缘对齐 */
    display: flex;
    flex-direction: row;
    align-items: stretch;
    gap: 0;
  }

  &__item {
    position: relative;
    flex: 1 1 auto;
    min-width: 0;
    padding: 6px 2px 9px;
    border: none;
    background: transparent;
    color: var(--muted);
    font: inherit;
    font-size: 12px;
    white-space: nowrap;
    text-align: center;
    cursor: pointer;
    transition: color 0.16s;

    &:hover {
      color: var(--ink-soft);
    }

    &.is-active {
      color: var(--ink);
      font-weight: 700;
    }
  }

  &__idx,
  &__en {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
  }

  &__count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 12px;
    height: 12px;
    margin-left: 2px;
    padding: 0 2px;
    vertical-align: top;
    background: var(--accent);
    color: var(--on-accent);
    font-size: 7px;
    line-height: 1;
  }

  &__track {
    position: relative;
    height: 3px;

    &::before {
      content: '';
      position: absolute;
      top: 1px;
      left: 0;
      right: 0;
      height: 1px;
      background: var(--line);
    }
  }

  &__bar {
    position: absolute;
    top: 0;
    left: 0;
    height: 3px;
    background: var(--accent);
    transform: translateX(0);
    transition: none;

    &.is-ready {
      transition: transform 0.36s cubic-bezier(0.16, 1, 0.3, 1), width 0.36s cubic-bezier(0.16, 1, 0.3, 1);
    }
  }

  /* ---- 二级：子视图 + 刷新 ---- */
  &__subs {
    flex: none;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 9px 14px;
    border-bottom: 1px solid var(--line);
    overflow-x: auto;
    scrollbar-width: none;

    &::-webkit-scrollbar {
      display: none;
    }
  }

  &__sub {
    flex: none;
    padding: 0 0 3px;
    border: none;
    border-bottom: 1px solid transparent;
    background: transparent;
    color: var(--faint);
    font: inherit;
    font-size: 10px;
    white-space: nowrap;
    cursor: pointer;
    transition: color 0.16s, border-color 0.16s;

    &:hover {
      color: var(--ink-soft);
    }

    &.is-active {
      color: var(--ink);
      border-bottom-color: var(--accent);
    }
  }

  &__refresh {
    flex: none;
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--faint);
    font-size: 9px;
    cursor: pointer;

    &:hover {
      color: var(--accent);
    }
  }

  /* ---- 条目列表 ---- */
  &__list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 4px 0 12px;
  }

  /* 列表项少时垂直居中，避免顶部堆一撮、下面大片留白；
     min-height:100% + 固定 cap 高度，让居中只在剩余空间里发生 */
  &__list-body {
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-height: calc(100% - 30px);
  }

  &__list-cap {
    padding: 10px 14px 8px;
    font-size: 7px;
    letter-spacing: 0.14em;
    color: var(--faint);
  }

  &__row {
    position: relative;
    width: 100%;
    display: grid;
    grid-template-columns: 36px minmax(0, 1fr) 18px;
    align-items: center;
    gap: 9px;
    padding: 6px 14px;
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
    overflow: hidden;

    /* Hydrogen LibraryList：hover 时遮罩从左侧滑入 */
    &::after {
      content: '';
      position: absolute;
      inset: 0;
      background: var(--hover);
      transform: translateX(-100%);
      transition: transform 0.18s ease-out;
      pointer-events: none;
    }

    &:hover::after {
      transform: translateX(0);
    }

    &.is-selected {
      background: var(--accent-weak);
      box-shadow: inset 2px 0 0 var(--accent);
    }

    > * {
      position: relative;
      z-index: 1;
    }
  }

  &__thumb {
    width: 36px;
    height: 36px;
    border: 1px solid var(--line);
    background: var(--surface);
    display: grid;
    place-items: center;
    overflow: hidden;

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    &.is-round {
      border-radius: 50%;

      img {
        border-radius: 50%;
      }
    }
  }

  &__thumb-tag {
    font-size: 8px;
    letter-spacing: 0.08em;
    color: var(--muted);
  }

  &__row-main {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  &__row-name {
    display: block;
    font-size: 11px;
    color: var(--ink-soft);
  }

  &__row-sub {
    display: block;
    font-size: 9px;
    color: var(--muted);
  }

  &__row-idx {
    font-size: 8px;
    color: var(--faint);
    text-align: right;
  }

  &__none {
    padding: 22px 14px;
    font-size: 9px;
    letter-spacing: 0.16em;
    color: var(--faint);
  }
}

/* 右栏：library-view */
.library-view {
  min-width: 0;
  /* 切板块只做「模糊淡入」：没有 translateY，范围也只有右栏这一块。
     用 backwards 让动画结束后回到无 filter 的原始样式，避免常驻 filter
     影响内部 sticky / fixed 子元素的定位基准。 */
  animation: view-fade 0.3s cubic-bezier(0.16, 1, 0.3, 1) backwards;
}

@keyframes view-fade {
  from {
    opacity: 0;
    filter: blur(10px);
  }
  to {
    opacity: 1;
    filter: blur(0);
  }
}

/* 切换歌单详情：模糊淡出 → 模糊淡入，无位移，和切板块同一套语言 */
.detail-switch {
  min-width: 0;
}

.detail-fade-enter-active {
  transition: opacity 0.26s cubic-bezier(0.16, 1, 0.3, 1), filter 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.detail-fade-leave-active {
  transition: opacity 0.16s ease, filter 0.18s ease;
}

.detail-fade-enter-from {
  opacity: 0;
  filter: blur(9px);
}

.detail-fade-leave-to {
  opacity: 0;
  filter: blur(7px);
}

.view-head {
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding-bottom: 14px;
  margin-bottom: 24px;
  border-bottom: 1px solid var(--line);

  /* 下载 / 本地 / 历史 / 设置的内嵌页自带大标题，这里降成面包屑避免重复 */
  &.is-compact {
    align-items: center;
    padding-bottom: 9px;
    margin-bottom: 14px;

    .view-head__title {
      font-size: 13px;
      font-weight: 500;
    }
  }

  &__title {
    font-size: 26px;
    line-height: 1.1;
  }

  &__line {
    flex: 1;
    height: 1px;
    background: var(--line);
  }

  &__sub {
    font-size: 9px;
    color: var(--accent);
    letter-spacing: 0.08em;
  }

  .my__create {
    flex: none;
    align-self: center;
  }
}

/* Hydrogen 右栏歌单详情：大封面 + 标题 + 元信息 + 操作 + 右上创建时间 */
.pl-head {
  display: grid;
  grid-template-columns: 148px minmax(0, 1fr) auto;
  align-items: start;
  gap: 24px;
  padding-bottom: 22px;
  margin-bottom: 18px;
  border-bottom: 1px solid var(--line);

  &__cover {
    width: 148px;
    height: 148px;
    display: grid;
    place-items: center;
    background-color: var(--paper-deep);
    background-size: cover;
    background-position: center;
    border: 1px solid var(--line);
    color: var(--faint);
  }

  &__meta {
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  &__title {
    font-size: 27px;
    line-height: 1.2;
  }

  &__sub {
    font-size: 10px;
    color: var(--muted);

    i {
      font-style: normal;
      padding: 0 4px;
      color: var(--faint);
    }
  }

  &__acts {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 4px;
  }

  &__side {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 10px;
  }

  &__date {
    padding: 4px 9px;
    border: 1px solid var(--line);
    font-size: 9px;
    letter-spacing: 0.04em;
    color: var(--ink-soft);
  }
}

.pl-section {
  margin-bottom: 10px;

  &__state {
    font-size: 8px;
    letter-spacing: 0.14em;
    color: var(--faint);
  }
}

.pl-error {
  margin-top: 12px;
  padding-left: 9px;
  border-left: 2px solid var(--danger);
  font-size: 10px;
  line-height: 1.6;
  color: var(--danger);
}

@media (max-width: 1180px) {
  .pl-head {
    grid-template-columns: 110px minmax(0, 1fr);
    gap: 16px;

    &__cover {
      width: 110px;
      height: 110px;
    }

    &__side {
      grid-column: 1 / -1;
      flex-direction: row;
      align-items: center;
      justify-content: flex-end;
    }
  }
}

/* Hydrogen 的 NONE 空态：四角画框 + 对角细线 */
.lib-none {
  position: relative;
  display: grid;
  place-items: center;
  min-height: 280px;
  margin-top: 8px;
  overflow: hidden;

  /* 收藏分区：整块内容区都是 NONE 画框，对角线与角标随容器放大 */
  &--full {
    min-height: 100%;
    margin-top: 0;
  }

  &__corner {
    position: absolute;
    width: 11px;
    height: 11px;
    border: 1px solid var(--line-strong);

    &.is-tl {
      top: 12px;
      left: 0;
      border-right: none;
      border-bottom: none;
    }

    &.is-tr {
      top: 12px;
      right: 0;
      border-left: none;
      border-bottom: none;
    }

    &.is-bl {
      bottom: 4px;
      left: 0;
      border-right: none;
      border-top: none;
    }

    &.is-br {
      bottom: 4px;
      right: 0;
      border-left: none;
      border-top: none;
    }
  }

  &__diag {
    position: absolute;
    width: 38%;
    height: 38%;
    /* 参考图的两条辅助线是左下 → 右上（/），不是反斜线 */
    background: linear-gradient(
      to top right,
      transparent 0,
      transparent calc(50% - 0.5px),
      var(--line-strong) 50%,
      transparent calc(50% + 0.5px),
      transparent 100%
    );
    opacity: 0;
    animation: lib-none-line 0.5s cubic-bezier(0.32, 0.81, 0.56, 0.98) forwards;

    &.is-a {
      left: 6%;
      bottom: 6%;
    }

    &.is-b {
      top: 8%;
      right: 6%;
    }
  }

  &__tip {
    position: relative;
    z-index: 1;
    padding: 7px 16px;
    background: var(--paper);
    color: var(--ink-soft);
    font-size: 13px;
    letter-spacing: 0.34em;
    opacity: 0;
    animation: lib-none-tip 0.32s 0.14s ease-out forwards;
  }
}

@keyframes lib-none-line {
  from {
    transform: scale(0.25);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 0.5;
  }
}

@keyframes lib-none-tip {
  0% {
    opacity: 0;
    letter-spacing: 0.1em;
  }
  60% {
    opacity: 1;
  }
  100% {
    opacity: 1;
    letter-spacing: 0.34em;
  }
}

@media (max-width: 1180px) {
  .my__layout {
    grid-template-columns: 230px minmax(0, 1fr);
    gap: 26px;
  }
}

.my__create {
  height: 28px;
  padding: 0 10px;
}

.my__panel-cap {
  display: block;
  margin: 6px 0 10px;
  font-size: 8px;
}

.guest {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 260px;
  gap: 40px;
  align-items: center;
  padding: 50px 0;
  min-height: 380px;

  &__main {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 14px;
  }

  &__title {
    font-size: 36px;
  }

  &__desc {
    color: var(--muted);
    font-size: 12px;
    margin-bottom: 8px;
    max-width: 320px;
    line-height: 1.8;
  }

  &__list {
    list-style: none;
    margin: 0;
    padding: 0;
    border-top: 1px solid var(--line);
  }

  &__item {
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr);
    gap: 2px 12px;
    padding: 16px 2px;
    border-bottom: 1px solid var(--line);
  }

  &__num {
    grid-row: span 2;
    font-size: 9px;
    color: var(--faint);
    padding-top: 4px;
  }

  &__label {
    font-size: 14px;
    color: var(--ink);
  }

  &__note {
    font-size: 11px;
    color: var(--muted);
  }
}

.likes-block {
  margin-bottom: 36px;
}

.likes {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 30px;
  padding: 22px 26px;
  background: var(--accent);
  color: var(--on-accent);
  cursor: pointer;
  overflow: hidden;

  &::after {
    content: '';
    position: absolute;
    right: 120px;
    top: -40px;
    width: 160px;
    height: 160px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 50%;
  }

  &__left {
    display: flex;
    flex-direction: column;
    gap: 8px;
    z-index: 1;
  }

  &__title {
    font-size: 26px;
    color: var(--paper);
  }

  &__count {
    font-size: 9px;
    color: rgba(247, 246, 242, 0.72);
  }

  &__cover {
    width: 84px;
    height: 84px;
    background-color: rgba(255, 255, 255, 0.08);
    background-size: cover;
    background-position: center;
    display: grid;
    place-items: center;
    color: rgba(255, 255, 255, 0.75);
    --frame-color: rgba(255, 255, 255, 0.4);
    z-index: 1;
    flex: none;
  }

  &__play {
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    border: 1px solid rgba(255, 255, 255, 0.35);
    color: var(--paper);
    transition: background 0.18s, color 0.18s;
    flex: none;
    z-index: 1;

    &:hover {
      background: var(--paper);
      color: var(--ink);
    }
  }
}

.section {
  margin-bottom: 12px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 24px 18px;
}

.empty {
  padding: 0;
  color: var(--muted);
  font-size: 12px;
}

/* 历史概览 */
.history-section {
  margin-bottom: 20px;
}

.history-head {
  align-items: center;
  flex-wrap: wrap;
  row-gap: 10px;

  .hb-btn {
    flex: none;
  }
}

/* 下载概览 */
.dl-section {
  margin-bottom: 20px;
}

.dl-head {
  align-items: center;
  flex-wrap: wrap;
  row-gap: 10px;

  &__acts {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: 10px;
  }
}

.dl-card {
  position: relative;
  background: var(--glass-panel);
  border: 1px solid var(--line);
  padding: 18px 20px 8px;
  box-shadow: inset 0 1px 0 var(--glass-edge);
  transition: border-color 0.2s;

  &.is-busy {
    border-color: var(--accent);
  }

  &__stats {
    display: flex;
    align-items: center;
    gap: 24px;
    flex-wrap: wrap;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--line-soft);
  }

  &__progress {
    flex: 1;
    min-width: 150px;
    max-width: 320px;
    margin-left: auto;
  }

  &__progress-top {
    display: flex;
    justify-content: space-between;
    font-size: 9px;
    color: var(--muted);
    margin-bottom: 7px;
  }

  &__track {
    height: 3px;
    background: var(--track);
    overflow: hidden;
  }

  &__fill {
    height: 100%;
    background: var(--accent);
    transition: width 0.25s ease;
  }
}

.dl-stat {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 54px;

  &__num {
    font-size: 22px;
    line-height: 1.1;
    color: var(--ink);
  }

  &__label {
    font-size: 8px;
  }

  &.is-accent .dl-stat__num {
    color: var(--accent);
  }

  &.is-danger .dl-stat__num {
    color: var(--danger);
  }
}

.dl-rows {
  padding-top: 2px;
}

.dl-row {
  width: 100%;
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) auto 14px;
  align-items: center;
  column-gap: 10px;
  padding: 10px 0;
  border: none;
  border-bottom: 1px solid var(--line-soft);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background 0.16s;

  &:hover {
    background: var(--hover);
  }

  &.is-downloading,
  &.is-fetching {
    border-left: 2px solid var(--accent);
    padding-left: 8px;
  }

  &.is-error {
    border-left: 2px solid var(--danger);
    padding-left: 8px;
  }

  &__icon {
    display: grid;
    place-items: center;
    color: var(--faint);

    &.is-done {
      color: var(--accent);
    }

    &.is-downloading,
    &.is-fetching {
      color: var(--ink);
    }

    &.is-error {
      color: var(--danger);
    }
  }

  &__dot {
    width: 5px;
    height: 5px;
    background: var(--faint);
  }

  &__main {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  &__name {
    display: block;
    font-size: 12px;
    color: var(--ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__artist {
    display: block;
    font-size: 10px;
    color: var(--muted);
    font-weight: 400;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__text {
    display: block;
    max-width: 180px;
    font-size: 9px;
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;

    &.is-error {
      color: var(--danger);
    }
  }

  &__arrow {
    display: grid;
    place-items: center;
    color: var(--faint);
    transition: transform 0.16s, color 0.16s;
  }

  &:hover .dl-row__arrow {
    color: var(--ink);
    transform: translateX(2px);
  }

  &__track {
    grid-column: 2 / -1;
    height: 2px;
    margin-top: 2px;
    background: var(--track);
    overflow: hidden;
  }

  &__fill {
    display: block;
    height: 100%;
    background: var(--accent);
    transition: width 0.25s ease;
  }
}

.dl-more {
  margin: 12px 0 6px;
  font-size: 9px;
  color: var(--faint);
  text-align: center;
}

.dl-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 30px 20px 34px;
  color: var(--faint);
  text-align: center;

  p {
    font-size: 12px;
    color: var(--muted);
    margin: 6px 0 0;
  }

  span {
    font-size: 10px;
    line-height: 1.6;
  }
}
</style>
