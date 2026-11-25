<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  ACCENTS,
  PLAY_MODES,
  QUALITIES,
  hexToHsl,
  hslToHex,
  useSettingsStore
} from '../store/settingsStore'
import { useHistoryStore } from '../store/historyStore'
import { useUiStore } from '../store/uiStore'
import { useUserStore } from '../store/userStore'
import api from '../utils/windowApi'
import Icon from '../components/Icon.vue'
import pkg from '../../package.json'

const settings = useSettingsStore()
const history = useHistoryStore()
const ui = useUiStore()
const user = useUserStore()
const router = useRouter()
const showAccounts = ref(false)

function switchTo(userId) {
  if (String(userId) === String(user.user?.userId)) return
  if (!user.switchAccount(userId)) return
  ui.toast('已切换账号')
  showAccounts.value = false
  // 切换登录态后重新挂载，避免歌单 / 喜欢列表还停留在上一个账号
  setTimeout(() => window.location.reload(), 450)
}

function removeSavedAccount(userId) {
  user.removeAccount(userId)
  ui.toast('已移除该账号')
}

const SECTIONS = [
  { id: 'appearance', index: '01', title: '外观', en: 'APPEARANCE' },
  { id: 'playback', index: '02', title: '播放', en: 'PLAYBACK' },
  { id: 'lyric', index: '03', title: '歌词', en: 'LYRIC' },
  { id: 'download', index: '04', title: '下载', en: 'DOWNLOAD' },
  { id: 'storage', index: '05', title: '存储', en: 'STORAGE' },
  { id: 'shortcuts', index: '06', title: '快捷键', en: 'SHORTCUTS' },
  { id: 'about', index: '07', title: '关于', en: 'ABOUT' }
]

const active = ref('appearance')
const hexInput = ref(settings.accent)
const hsl = ref(hexToHsl(settings.accent))
const downloadDir = ref('')
const query = ref('')
const noMatch = ref(false)
const panelsRef = ref(null)
let observer = null

const version = computed(() => pkg.version)
const historyCount = computed(() => history.items.length)

const storageSize = computed(() => {
  let bytes = 0
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i) || ''
      bytes += key.length + (localStorage.getItem(key) || '').length
    }
  } catch (err) {
    return '—'
  }
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
})

function scrollTo(id) {
  active.value = id
  document.getElementById(`sec-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function commit(patch, message) {
  settings.update(patch)
  if (message) ui.toast(message)
}

function pickAccent(value) {
  settings.setAccent(value)
  hsl.value = hexToHsl(value)
  hexInput.value = value
}

function slide(key, value) {
  hsl.value = { ...hsl.value, [key]: Number(value) }
  settings.setAccentHsl(hsl.value)
  hexInput.value = settings.accent
}

function commitHex() {
  const value = hexInput.value.trim()
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)) {
    hexInput.value = settings.accent
    ui.toast('色值格式不对，用 #RRGGBB')
    return
  }
  pickAccent(value)
}

function resetAccent() {
  pickAccent('#6f754d')
}

async function chooseDir() {
  const dir = await api.chooseDownloadDir()
  if (!dir) return
  settings.update({ downloadFolder: dir })
  downloadDir.value = dir
  ui.toast('下载目录已更新')
}

function openDir() {
  api.openDir(settings.downloadFolder || downloadDir.value)
}

async function chooseBg() {
  const file = await api.chooseImage()
  if (!file) return
  settings.update({ customBg: file })
  ui.toast('背景已更新')
}

function clearBg() {
  settings.update({ customBg: '' })
  ui.toast('已恢复默认背景')
}

function applyFilter() {
  const container = panelsRef.value
  if (!container) return
  const q = query.value.trim().toLowerCase()

  container.querySelectorAll('.panel').forEach((panel) => {
    const title = (panel.querySelector('.panel__title')?.textContent || '').toLowerCase()
    const titleHit = q && title.includes(q)
    let visible = 0

    panel.querySelectorAll('.row').forEach((row) => {
      const hit = !q || titleHit || (row.textContent || '').toLowerCase().includes(q)
      row.classList.toggle('is-filtered-out', !hit)
      if (hit) visible += 1
    })

    panel.querySelectorAll('.keys, .about').forEach((block) => {
      const hit = !q || titleHit || (block.textContent || '').toLowerCase().includes(q)
      block.classList.toggle('is-filtered-out', !hit)
      if (hit) visible += 1
    })

    panel.classList.toggle('is-filtered-out', !!q && !visible)
    if (!q) panel.classList.remove('is-filtered-out')
  })

  noMatch.value =
    !!q && ![...container.querySelectorAll('.panel')].some((panel) => !panel.classList.contains('is-filtered-out'))
}

function clearHistory() {
  history.clear()
  ui.toast('播放历史已清空')
}

function clearAllData() {
  localStorage.clear()
  ui.toast('本地数据已清空，正在重载…')
  setTimeout(() => window.location.reload(), 700)
}

function resetAll() {
  settings.reset()
  hsl.value = hexToHsl(settings.accent)
  hexInput.value = settings.accent
  ui.toast('已恢复默认设置')
}

watch(query, applyFilter)

watch(
  () => settings.accent,
  (value) => {
    if (hslToHex(hsl.value) !== value.toLowerCase()) hsl.value = hexToHsl(value)
    hexInput.value = value
  }
)

onMounted(async () => {
  settings.apply()
  try {
    downloadDir.value = settings.downloadFolder || (await api.getDownloadDir())
  } catch (err) {
    downloadDir.value = settings.downloadFolder || ''
  }

  const root = document.querySelector('.body')
  if (!root || typeof IntersectionObserver === 'undefined') return
  observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
      if (visible.length) active.value = visible[0].target.id.replace('sec-', '')
    },
    { root, rootMargin: '-15% 0px -70% 0px', threshold: 0 }
  )
  SECTIONS.forEach((section) => {
    const el = document.getElementById(`sec-${section.id}`)
    if (el) observer.observe(el)
  })
})

onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <div class="settings">
    <header class="settings__head">
      <div>
        <h1 class="settings__title hb-display">设置</h1>
        <div class="settings__sub hb-mono">ELECTRON MUSIC / PREFERENCES · v{{ version }}</div>
      </div>

      <div class="settings__search">
        <Icon name="search" :size="12" />
        <input v-model="query" placeholder="搜索设置项，如 音质 / 主题 / 下载" spellcheck="false" />
        <button v-if="query" class="settings__clear hb-mono" @click="query = ''">CLEAR</button>
      </div>
    </header>

    <!-- 当前账号 / 多用户切换 -->
    <section v-if="user.loggedIn" class="profile hb-acrylic">
      <img class="profile__avatar" :src="`${user.user.avatarUrl}?param=120y120`" alt="" />
      <div class="profile__info">
        <span class="hb-label">ACCOUNT / 当前用户</span>
        <div class="profile__name hb-display">{{ user.user.nickname }}</div>
        <div class="profile__sign">{{ user.user.signature || '这个人很懒，什么都没有留下' }}</div>
        <div class="profile__meta hb-mono">
          <span :class="{ 'is-vip': user.isVip }">{{ user.isVip ? 'VIP' : 'FREE' }}</span>
          <i>·</i>
          <span>{{ user.accounts.length }} ACCOUNTS</span>
        </div>
      </div>
      <div class="profile__actions">
        <button class="hb-btn hb-btn--mini" @click="showAccounts = !showAccounts">
          <Icon name="user" :size="12" /> 切换账号
        </button>
        <Transition name="profile-fade">
          <div v-if="showAccounts" class="profile__list">
            <div
              v-for="account in user.accounts"
              :key="account.userId"
              class="profile__account"
              :class="{ 'is-current': String(account.userId) === String(user.user.userId) }"
              @click="switchTo(account.userId)"
            >
              <img :src="`${account.avatarUrl}?param=60y60`" alt="" />
              <span class="profile__account-name hb-clamp-1">{{ account.nickname }}</span>
              <Icon v-if="String(account.userId) === String(user.user.userId)" name="check" :size="12" />
              <button v-else class="profile__account-del" title="移除账号" @click.stop="removeSavedAccount(account.userId)">×</button>
            </div>
            <button class="profile__add" @click="router.push('/login')">
              <Icon name="plus" :size="11" /> 添加账号
            </button>
          </div>
        </Transition>
      </div>
    </section>

    <section v-else class="profile profile--guest hb-acrylic">
      <div class="profile__guest-icon"><Icon name="user" :size="22" /></div>
      <div class="profile__info">
        <span class="hb-label">ACCOUNT / 当前用户</span>
        <div class="profile__name hb-display">未登录</div>
        <div class="profile__sign">登录后在这里显示头像、昵称与个签</div>
      </div>
      <button class="hb-btn hb-btn--solid" @click="router.push('/login')">扫码登录</button>
    </section>

    <p v-if="noMatch" class="settings__empty">没有匹配「{{ query }}」的设置项</p>

    <div class="settings__layout">
      <aside class="nav">
        <div class="nav__cap hb-mono">SETTINGS / 设置</div>
        <button
          v-for="section in SECTIONS"
          :key="section.id"
          class="nav__item"
          :class="{ 'is-active': active === section.id }"
          @click="scrollTo(section.id)"
        >
          <span class="nav__idx hb-mono">{{ section.index }}</span>
          <span>{{ section.title }}</span>
        </button>

        <button class="nav__reset hb-mono" @click="resetAll">RESET / 恢复默认</button>
      </aside>

      <div class="panels" ref="panelsRef">
        <!-- 01 外观 -->
        <section id="sec-appearance" class="panel">
          <div class="panel__head">
            <h2 class="panel__title">外观</h2>
            <span class="hb-mono">APPEARANCE</span>
          </div>

          <div class="row row--block">
            <div class="row__label">主题色</div>

            <div class="accent">
              <div class="accent__presets">
                <button
                  v-for="accent in ACCENTS"
                  :key="accent.value"
                  class="swatch"
                  :class="{ 'is-active': settings.accent.toLowerCase() === accent.value }"
                  :style="{ background: accent.value }"
                  :title="accent.name"
                  @click="pickAccent(accent.value)"
                />
                <span class="accent__spacer" />
                <input class="hex" v-model="hexInput" spellcheck="false" @change="commitHex" @keyup.enter="commitHex" />
                <button class="accent__reset hb-mono" @click="resetAccent">RESET</button>
              </div>

              <label class="hsl">
                <span class="hsl__cap hb-mono">色相</span>
                <input class="range" type="range" min="0" max="360" :value="hsl.h" @input="slide('h', $event.target.value)" />
                <span class="hsl__val hb-mono">{{ hsl.h }}</span>
              </label>
              <label class="hsl">
                <span class="hsl__cap hb-mono">饱和度</span>
                <input class="range" type="range" min="0" max="100" :value="hsl.s" @input="slide('s', $event.target.value)" />
                <span class="hsl__val hb-mono">{{ hsl.s }}</span>
              </label>
              <label class="hsl">
                <span class="hsl__cap hb-mono">明度</span>
                <input class="range" type="range" min="5" max="95" :value="hsl.l" @input="slide('l', $event.target.value)" />
                <span class="hsl__val hb-mono">{{ hsl.l }}</span>
              </label>
            </div>
          </div>

          <div class="row">
            <div class="row__label">
              主题
              <span class="row__note">跟随系统会随 Windows 深浅色自动切换</span>
            </div>
            <div class="row__control">
              <div class="seg">
                <button :class="{ 'is-active': settings.theme === 'auto' }" @click="commit({ theme: 'auto' })">跟随系统</button>
                <button :class="{ 'is-active': settings.theme === 'light' }" @click="commit({ theme: 'light' })">浅色</button>
                <button :class="{ 'is-active': settings.theme === 'dark' }" @click="commit({ theme: 'dark' })">深色</button>
              </div>
            </div>
          </div>

          <div class="row">
            <div class="row__label">背景</div>
            <div class="row__control">
              <div class="seg">
                <button :class="{ 'is-active': settings.grid }" @click="commit({ grid: true })">网格纸</button>
                <button :class="{ 'is-active': !settings.grid }" @click="commit({ grid: false })">纯色</button>
              </div>
            </div>
          </div>

          <div class="row">
            <div class="row__label">
              低性能模式
              <span class="row__note">关闭模糊、动画与半透明，提升低配设备流畅度</span>
            </div>
            <div class="row__control">
              <div class="seg">
                <button :class="{ 'is-active': !settings.lowPerformance }" @click="commit({ lowPerformance: false })">关闭</button>
                <button :class="{ 'is-active': settings.lowPerformance }" @click="commit({ lowPerformance: true })">开启</button>
              </div>
            </div>
          </div>

          <div class="row">
            <div class="row__label">
              界面缩放
              <span class="row__note">影响整个窗口的显示比例</span>
            </div>
            <div class="row__control">
              <input
                class="range"
                type="range"
                min="80"
                max="120"
                step="5"
                :value="settings.uiScale"
                @input="settings.update({ uiScale: Number($event.target.value) })"
              />
              <span class="range__value hb-mono">{{ settings.uiScale }}%</span>
            </div>
          </div>

          <div class="row">
            <div class="row__label">
              自定义背景图
              <span class="row__note">铺满窗口并盖一层纸色，保证文字可读</span>
            </div>
            <div class="row__control row__control--wide">
              <span class="path hb-clamp-1">{{ settings.customBg || '未设置' }}</span>
              <button class="hb-btn" @click="chooseBg">选择图片</button>
              <button class="hb-btn" :disabled="!settings.customBg" @click="clearBg">清除</button>
            </div>
          </div>
        </section>

        <!-- 02 播放 -->
        <section id="sec-playback" class="panel">
          <div class="panel__head">
            <h2 class="panel__title">播放</h2>
            <span class="hb-mono">PLAYBACK</span>
          </div>

          <div class="row">
            <div class="row__label">
              音质
              <span class="row__note">会员曲目需要对应等级；风控时自动退回旧接口</span>
            </div>
            <div class="row__control">
              <div class="seg">
                <button
                  v-for="option in QUALITIES"
                  :key="option.value"
                  :class="{ 'is-active': settings.quality === option.value }"
                  @click="commit({ quality: option.value }, '音质已更新')"
                >
                  {{ option.label }}
                </button>
              </div>
            </div>
          </div>

          <div class="row">
            <div class="row__label">启动音量</div>
            <div class="row__control">
              <input
                class="range"
                type="range"
                min="0"
                max="100"
                step="5"
                :value="settings.startVolume"
                @input="settings.update({ startVolume: Number($event.target.value) })"
              />
              <span class="range__value hb-mono">{{ settings.startVolume }}%</span>
            </div>
          </div>

          <div class="row">
            <div class="row__label">启动播放模式</div>
            <div class="row__control">
              <div class="seg">
                <button
                  v-for="mode in PLAY_MODES"
                  :key="mode.value"
                  :class="{ 'is-active': settings.startPlayMode === mode.value }"
                  @click="commit({ startPlayMode: mode.value })"
                >
                  {{ mode.label }}
                </button>
              </div>
            </div>
          </div>

          <div class="row">
            <div class="row__label">
              拖动进度条实时跳转
              <span class="row__note">关掉后松手才跳转</span>
            </div>
            <div class="row__control">
              <div class="seg">
                <button :class="{ 'is-active': settings.seekLive }" @click="commit({ seekLive: true })">开</button>
                <button :class="{ 'is-active': !settings.seekLive }" @click="commit({ seekLive: false })">关</button>
              </div>
            </div>
          </div>

          <div class="row">
            <div class="row__label">切歌淡入</div>
            <div class="row__control">
              <div class="seg">
                <button :class="{ 'is-active': settings.crossfade }" @click="commit({ crossfade: true })">开</button>
                <button :class="{ 'is-active': !settings.crossfade }" @click="commit({ crossfade: false })">关</button>
              </div>
            </div>
          </div>
        </section>

        <!-- 03 歌词 -->
        <section id="sec-lyric" class="panel">
          <div class="panel__head">
            <h2 class="panel__title">歌词</h2>
            <span class="hb-mono">LYRIC</span>
          </div>

          <div class="row">
            <div class="row__label">歌词字号</div>
            <div class="row__control">
              <span class="range__cap">A</span>
              <input
                class="range"
                type="range"
                min="14"
                max="30"
                step="1"
                :value="settings.lyricSize"
                @input="settings.update({ lyricSize: Number($event.target.value) })"
              />
              <span class="range__value hb-mono">{{ settings.lyricSize }}px</span>
            </div>
          </div>

          <div class="row">
            <div class="row__label">翻译字号</div>
            <div class="row__control">
              <span class="range__cap">A</span>
              <input
                class="range"
                type="range"
                min="10"
                max="20"
                step="1"
                :value="settings.transSize"
                @input="settings.update({ transSize: Number($event.target.value) })"
              />
              <span class="range__value hb-mono">{{ settings.transSize }}px</span>
            </div>
          </div>

          <div class="row">
            <div class="row__label">
              全屏显示歌词
              <span class="row__note">播放页右上角也能临时切换</span>
            </div>
            <div class="row__control">
              <div class="seg">
                <button :class="{ 'is-active': settings.showLyric }" @click="commit({ showLyric: true })">开</button>
                <button :class="{ 'is-active': !settings.showLyric }" @click="commit({ showLyric: false })">关</button>
              </div>
            </div>
          </div>

          <div class="row">
            <div class="row__label">显示翻译</div>
            <div class="row__control">
              <div class="seg">
                <button :class="{ 'is-active': settings.showTrans }" @click="commit({ showTrans: true })">开</button>
                <button :class="{ 'is-active': !settings.showTrans }" @click="commit({ showTrans: false })">关</button>
              </div>
            </div>
          </div>

          <div class="row">
            <div class="row__label">
              隐藏制作人员信息
              <span class="row__note">过滤「作词 / 作曲 / 编曲」这类行</span>
            </div>
            <div class="row__control">
              <div class="seg">
                <button :class="{ 'is-active': settings.hideCredits }" @click="commit({ hideCredits: true })">开</button>
                <button :class="{ 'is-active': !settings.hideCredits }" @click="commit({ hideCredits: false })">关</button>
              </div>
            </div>
          </div>
        </section>

        <!-- 04 下载 -->
        <section id="sec-download" class="panel">
          <div class="panel__head">
            <h2 class="panel__title">下载</h2>
            <span class="hb-mono">DOWNLOAD</span>
          </div>

          <div class="row">
            <div class="row__label">
              保存目录
              <span class="row__note">留空则用系统音乐目录 / ElectronMusic</span>
            </div>
            <div class="row__control row__control--wide">
              <span class="path hb-clamp-1">{{ settings.downloadFolder || downloadDir || '默认目录' }}</span>
              <button class="hb-btn" @click="chooseDir">选择</button>
              <button class="hb-btn" @click="openDir">打开文件夹</button>
            </div>
          </div>

          <div class="row">
            <div class="row__label">
              同时下载
              <span class="row__note">批量下载时最多同时进行几首；在下载队列里也能随时改</span>
            </div>
            <div class="row__control">
              <div class="seg">
                <button
                  v-for="n in [1, 2, 3, 4, 5]"
                  :key="n"
                  :class="{ 'is-active': settings.downloadConcurrency === n }"
                  @click="commit({ downloadConcurrency: n }, '并发数已更新')"
                >
                  {{ n }}
                </button>
              </div>
            </div>
          </div>
        </section>

        <!-- 05 存储 -->
        <section id="sec-storage" class="panel">
          <div class="panel__head">
            <h2 class="panel__title">存储</h2>
            <span class="hb-mono">STORAGE</span>
          </div>

          <div class="row">
            <div class="row__label">播放历史</div>
            <div class="row__control">
              <span class="hb-mono hb-muted">{{ historyCount }} 条</span>
              <button class="hb-btn" :disabled="!historyCount" @click="clearHistory">清空</button>
            </div>
          </div>

          <div class="row">
            <div class="row__label">
              本地数据
              <span class="row__note">设置 / 播放队列 / 历史 / 登录状态</span>
            </div>
            <div class="row__control">
              <span class="hb-mono hb-muted">{{ storageSize }}</span>
              <button class="hb-btn hb-btn--danger" @click="clearAllData">全部清空</button>
            </div>
          </div>
        </section>

        <!-- 06 快捷键 -->
        <section id="sec-shortcuts" class="panel">
          <div class="panel__head">
            <h2 class="panel__title">快捷键</h2>
            <span class="hb-mono">SHORTCUTS</span>
          </div>

          <div class="row">
            <div class="row__label">
              全局快捷键
              <span class="row__note">关掉后只在窗口内响应空格播放/暂停</span>
            </div>
            <div class="row__control">
              <div class="seg">
                <button :class="{ 'is-active': settings.globalShortcuts }" @click="commit({ globalShortcuts: true })">开</button>
                <button :class="{ 'is-active': !settings.globalShortcuts }" @click="commit({ globalShortcuts: false })">关</button>
              </div>
            </div>
          </div>

          <div class="keys">
            <div
              v-for="key in [
                ['播放 / 暂停', 'Ctrl + Alt + P'],
                ['上一首', 'Ctrl + Alt + ←'],
                ['下一首', 'Ctrl + Alt + →'],
                ['音量 ±', 'Ctrl + Alt + ↑ / ↓'],
                ['快进 / 后退 3s', 'Ctrl + Alt + ] / ['],
                ['窗口内播放 / 暂停', 'Space'],
                ['返回上一页', 'Alt + ←']
              ]"
              :key="key[0]"
              class="keys__row"
            >
              <span class="keys__name">{{ key[0] }}</span>
              <span class="keys__combo hb-mono">{{ key[1] }}</span>
            </div>
          </div>
        </section>

        <!-- 07 关于 -->
        <section id="sec-about" class="panel">
          <div class="panel__head">
            <h2 class="panel__title">关于</h2>
            <span class="hb-mono">ABOUT</span>
          </div>

          <div class="row">
            <div class="row__label">记住窗口位置与大小</div>
            <div class="row__control">
              <div class="seg">
                <button :class="{ 'is-active': settings.rememberWindow }" @click="commit({ rememberWindow: true })">开</button>
                <button :class="{ 'is-active': !settings.rememberWindow }" @click="commit({ rememberWindow: false })">关</button>
              </div>
            </div>
          </div>

          <div class="row">
            <div class="row__label">关闭窗口时</div>
            <div class="row__control">
              <div class="seg">
                <button :class="{ 'is-active': settings.quitApp === 'minimize' }" @click="commit({ quitApp: 'minimize' })">
                  最小化到托盘
                </button>
                <button :class="{ 'is-active': settings.quitApp === 'quit' }" @click="commit({ quitApp: 'quit' })">
                  直接退出
                </button>
              </div>
            </div>
          </div>

          <div class="about">
            <div class="about__name">
              <span class="about__mark hb-wordmark" role="img" aria-label="Electron Music"></span>
              <span class="about__sub hb-mono">MUSIC</span>
            </div>
            <div class="about__ver hb-mono">VERSION {{ version }} · DEV BUILD</div>
            <p class="about__text">
              网易云音乐桌面客户端。视觉参照 Mass（塞壬唱片播放器）的纸质网格与等宽标签语言，
              只保留网易云在线功能：推荐、搜索、歌单 / 专辑 / 歌手、播放与歌词、我喜欢的音乐、播放历史与下载。
            </p>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.settings {
  max-width: 1240px;
  margin-inline: auto;
  padding: 28px var(--gutter) 56px;

  &__head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 24px;
    margin-bottom: 26px;
  }

  &__search {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 320px;
    height: 32px;
    padding: 0 10px;
    border: 1px solid var(--line-strong);
    background: var(--field-bg);
    color: var(--muted);
    transition: border-color 0.16s, color 0.16s;

    &:focus-within {
      border-color: var(--ink);
      color: var(--ink);
    }

    input {
      flex: 1;
      min-width: 0;
      font-size: 12px;
      color: var(--ink);

      &::placeholder {
        color: var(--faint);
      }
    }
  }

  &__clear {
    font-size: 8px;
    color: var(--faint);
  }

  &__empty {
    padding: 4px 0 18px;
    color: var(--muted);
    font-size: 12px;
  }

  &__title {
    font-size: 38px;
    line-height: 1.1;
  }

  &__sub {
    margin-top: 4px;
    color: var(--muted);
    font-size: 9px;
  }

  &__layout {
    display: grid;
    grid-template-columns: 176px minmax(0, 1fr);
    gap: 42px;
    align-items: start;
  }
}

.nav {
  position: sticky;
  top: calc(var(--titlebar) + 11px);
  display: flex;
  flex-direction: column;
  gap: 2px;

  &__cap {
    color: var(--faint);
    font-size: 8px;
    padding: 0 0 10px 12px;
  }

  &__item {
    display: flex;
    align-items: baseline;
    gap: 10px;
    padding: 7px 12px;
    text-align: left;
    font-size: 13px;
    color: var(--ink-soft);
    border-left: 2px solid transparent;
    transition: color 0.16s, border-color 0.16s, background 0.16s;

    &:hover {
      color: var(--ink);
      background: var(--hover);
    }

    &.is-active {
      color: var(--ink);
      border-left-color: var(--ink);
      background: var(--hover);
    }
  }

  &__idx {
    font-size: 8px;
    color: var(--faint);
  }

  &__reset {
    margin-top: 18px;
    margin-left: 12px;
    align-self: flex-start;
    padding: 5px 0;
    color: var(--faint);
    border-bottom: 1px solid transparent;

    &:hover {
      color: var(--ink);
      border-bottom-color: var(--line-strong);
    }
  }
}

.panels {
  min-width: 0;
}

.panel {
  background: var(--panel-bg);
  backdrop-filter: blur(20px) saturate(150%);
  -webkit-backdrop-filter: blur(20px) saturate(150%);
  border: 1px solid var(--line);
  padding: 20px 24px 8px;
  margin-bottom: 16px;

  &__head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    padding-bottom: 14px;
    margin-bottom: 4px;
    border-bottom: 1px solid var(--line);

    .hb-mono {
      color: var(--faint);
    }
  }

  &__title {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 18px;
  }
}

/* 搜索过滤：匹配项淡入 + 轻微模糊消散，过滤掉的项平滑折叠 */
.panel,
.row,
.keys,
.about {
  transition: opacity 0.24s var(--ease), filter 0.28s var(--ease),
    transform 0.24s var(--ease), margin 0.24s var(--ease), padding 0.24s var(--ease),
    max-height 0.28s var(--ease), border-color 0.2s;
}

.is-filtered-out {
  opacity: 0;
  filter: blur(6px);
  transform: translateY(-4px);
  max-height: 0 !important;
  overflow: hidden;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
  margin-bottom: 0 !important;
  border-color: transparent !important;
  pointer-events: none;
}

.row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 24px;
  align-items: center;
  padding: 15px 0;
  max-height: 400px;
  border-bottom: 1px solid var(--line-soft);

  &:last-child {
    border-bottom: 0;
  }

  &--block {
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
  }

  &__label {
    font-size: 13px;
    color: var(--ink);
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  /* 8px + var(--faint) 在暗色亚克力面板上几乎读不出来（截图里糊成一团）；
     说明文字改用正文字体、11px、--muted，中文不再被等宽字距拉散。 */
  &__note {
    font-family: var(--font-text);
    font-size: 11px;
    line-height: 1.5;
    letter-spacing: 0;
    color: var(--muted);
    text-transform: none;
  }

  &__control {
    display: flex;
    align-items: center;
    gap: 10px;
    justify-content: flex-end;

    &--wide {
      max-width: 560px;
    }
  }
}

.seg {
  display: flex;

  button {
    height: 28px;
    padding: 0 12px;
    margin-left: -1px;
    border: 1px solid var(--line-strong);
    font-family: var(--font-mono);
    font-size: 9px;
    letter-spacing: 0.1em;
    color: var(--ink-soft);
    background: transparent;
    transition: background 0.14s, color 0.14s;

    &:first-child {
      margin-left: 0;
    }

    &:hover {
      background: var(--hover);
    }

    &.is-active {
      background: var(--accent);
      border-color: var(--accent);
      color: var(--on-accent);
      position: relative;
      z-index: 1;
    }
  }
}

.accent {
  display: flex;
  flex-direction: column;
  gap: 12px;

  &__presets {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  &__spacer {
    flex: 1;
  }

  &__reset {
    font-size: 8px;
    color: var(--muted);
    border-bottom: 1px solid var(--line-strong);
    padding: 2px 0;
  }
}

.swatch {
  width: 26px;
  height: 26px;
  border: 1px solid var(--line-strong);
  transition: box-shadow 0.16s;

  &.is-active {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }
}

.hex {
  width: 92px;
  height: 26px;
  padding: 0 8px;
  border: 1px solid var(--line-strong);
  background: var(--field-bg);
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.08em;
  color: var(--ink-soft);
  background: var(--surface-2);
}

.hsl {
  display: grid;
  grid-template-columns: 46px minmax(0, 1fr) 34px;
  align-items: center;
  gap: 12px;

  &__cap {
    font-size: 8px;
    color: var(--faint);
  }

  &__val {
    font-size: 9px;
    color: var(--muted);
    text-align: right;
  }
}

.range {
  -webkit-appearance: none;
  width: 230px;
  height: 14px;
  background: transparent;
  cursor: pointer;

  &::-webkit-slider-runnable-track {
    height: 1px;
    background: var(--line-strong);
  }

  &::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 4px;
    height: 14px;
    background: var(--ink);
    margin-top: -7px;
  }

  &__cap {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--faint);
  }

  &__value {
    width: 40px;
    text-align: right;
    font-size: 9px;
    color: var(--muted);
  }
}

.hsl .range {
  width: 100%;
}

.path {
  flex: 1;
  min-width: 0;
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.04em;
  color: var(--muted);
  text-align: right;
}

.hb-btn--danger {
  border-color: var(--danger);
  color: var(--danger);

  &:hover {
    background: var(--danger);
    border-color: var(--danger);
    color: var(--paper);
  }
}

.keys {
  padding: 6px 0 12px;
  max-height: 2000px;

  &__row {
    display: flex;
    justify-content: space-between;
    padding: 7px 0;
    border-bottom: 1px solid var(--line-soft);

    &:last-child {
      border-bottom: 0;
    }
  }

  &__name {
    font-size: 12px;
    color: var(--ink-soft);
  }

  &__combo {
    font-size: 9px;
    color: var(--muted);
  }
}

.about {
  padding: 18px 0 20px;
  max-height: 2000px;

  &__name {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  &__mark {
    height: 24px;
  }

  &__sub {
    color: var(--muted);
    letter-spacing: 0.2em;
  }

  &__ver {
    margin-top: 2px;
    color: var(--muted);
    font-size: 9px;
  }

  &__text {
    margin-top: 14px;
    max-width: 640px;
    font-size: 12px;
    line-height: 1.9;
    color: var(--ink-soft);
  }

  &__meta {
    margin-top: 18px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  &__item {
    display: grid;
    grid-template-columns: 64px minmax(0, 1fr);
    gap: 12px;
    align-items: baseline;
    font-size: 11px;
    color: var(--muted);

    .hb-mono {
      color: var(--faint);
      font-size: 8px;
    }
  }
}

@media (max-width: 1120px) {
  .settings__layout {
    grid-template-columns: 148px minmax(0, 1fr);
    gap: 26px;
  }

  .range {
    width: 160px;
  }
}

/* ---- 当前账号 / 多账号切换 ---- */
.profile {
  position: relative;
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 16px 20px;
  margin-bottom: 24px;
  border-radius: 4px;
}

.profile__avatar {
  width: 54px;
  height: 54px;
  flex: none;
  border-radius: 50%;
  object-fit: cover;
  background: var(--hover);
}

.profile__guest-icon {
  width: 54px;
  height: 54px;
  flex: none;
  display: grid;
  place-items: center;
  border: 1px solid var(--line);
  border-radius: 50%;
  color: var(--muted);
}

.profile__info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.profile__name { font-size: 18px; line-height: 1.1; }

.profile__sign {
  font-size: 11px;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.profile__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 8px;
  letter-spacing: 0.1em;
  color: var(--faint);

  i { font-style: normal; }
  .is-vip { color: var(--accent); }
}

.profile__actions { position: relative; flex: none; }

.profile__list {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 20;
  width: 224px;
  padding: 6px;
  border: 1px solid var(--line);
  border-radius: 4px;
  background: var(--paper);
  -webkit-backdrop-filter: blur(22px) saturate(160%);
  backdrop-filter: blur(22px) saturate(160%);
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.2);
}

.profile__account {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 6px;
  border-radius: 3px;
  cursor: pointer;
  color: var(--ink-soft);
  transition: background 0.15s, color 0.15s;

  &:hover { background: var(--hover); color: var(--ink); }
  &.is-current { color: var(--accent); }

  img {
    width: 26px;
    height: 26px;
    flex: none;
    border-radius: 50%;
    object-fit: cover;
  }
}

.profile__account-name { flex: 1; min-width: 0; font-size: 11px; }

.profile__account-del {
  width: 18px;
  height: 18px;
  border: 0;
  border-radius: 3px;
  background: transparent;
  color: var(--faint);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;

  &:hover { background: var(--hover); color: var(--ink); }
}

.profile__add {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  margin-top: 5px;
  padding: 7px 0 4px;
  border: 0;
  border-top: 1px solid var(--line);
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 10px;
  cursor: pointer;

  &:hover { color: var(--accent); }
}

.profile-fade-enter-active,
.profile-fade-leave-active {
  transition: opacity 0.18s, filter 0.18s, transform 0.18s;
}
.profile-fade-enter-from,
.profile-fade-leave-to {
  opacity: 0;
  filter: blur(6px);
  transform: translateY(-4px);
}
</style>
