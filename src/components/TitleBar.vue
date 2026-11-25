<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '../utils/windowApi'
import { useUserStore } from '../store/userStore'
import { useSearchStore } from '../store/searchStore'
import { useUiStore } from '../store/uiStore'
import { logout } from '../api/login'
import { getSearchSuggest } from '../api/other'
import Icon from './Icon.vue'
import { goBack } from '../utils/nav'
import pkg from '../../package.json'

const router = useRouter()
const route = useRoute()
const user = useUserStore()
const search = useSearchStore()
const ui = useUiStore()

const version = pkg.version

const keyword = ref('')
const inputRef = ref(null)
const maximized = ref(false)
const showRecents = ref(false)
const accountOpen = ref(false)
const accountListOpen = ref(false)
const navRef = ref(null)
const navBar = ref({ left: 0, width: 0 })
const navReady = ref(false)
let hideTimer = null

const initial = computed(() => (user.user?.nickname || 'U').slice(0, 1).toUpperCase())

/* ---- 搜索建议：根据搜索框关键词推荐搜索条目 ---- */
const SUGGEST_TYPES = {
  1: '单曲',
  10: '专辑',
  100: '歌手',
  1000: '歌单',
  1002: '用户',
  1004: 'MV',
  1006: '歌词',
  1009: '电台',
  1014: '视频',
  1018: '综合',
  2000: '声音'
}

const suggestions = ref([])
const suggestLoading = ref(false)
const dropdownOpen = computed(
  () => showRecents.value && (!!keyword.value.trim() || search.recents.length > 0)
)
let suggestTimer = null
let suggestSeq = 0

function normalizeSuggest(res) {
  const allMatch = res?.result?.allMatch || []
  const out = allMatch
    .filter((x) => x && x.keyword)
    .slice(0, 8)
    .map((x) => ({ word: String(x.keyword), label: SUGGEST_TYPES[x.type] || '搜索' }))
  if (out.length) return out

  // 部分 API 版本返回分类数组而不是 allMatch，兜底取名称
  const result = res?.result || {}
  for (const [key, label] of [
    ['songs', '单曲'],
    ['artists', '歌手'],
    ['playlists', '歌单'],
    ['albums', '专辑']
  ]) {
    for (const item of (Array.isArray(result[key]) ? result[key] : []).slice(0, 3)) {
      const name = item?.name || item?.keyword
      if (name) out.push({ word: String(name), label })
    }
    if (out.length >= 8) break
  }
  return out.slice(0, 8)
}

/** 220ms 防抖；seq 丢弃过期响应，避免快速输入时旧结果盖掉新结果 */
function requestSuggest(word) {
  clearTimeout(suggestTimer)
  const q = (word || '').trim()
  if (!q || !showRecents.value) {
    suggestSeq++
    suggestions.value = []
    suggestLoading.value = false
    return
  }
  suggestLoading.value = true
  suggestTimer = setTimeout(async () => {
    const seq = ++suggestSeq
    try {
      const res = await getSearchSuggest({ keywords: q, type: 'mobile' })
      if (seq !== suggestSeq) return
      suggestions.value = normalizeSuggest(res)
    } catch (err) {
      if (seq !== suggestSeq) return
      suggestions.value = []
    } finally {
      if (seq === suggestSeq) suggestLoading.value = false
    }
  }, 220)
}

watch(keyword, (word) => requestSuggest(word))
watch(showRecents, (open) => {
  if (open) requestSuggest(keyword.value)
})

// 导航下划线：量出当前激活项的 left/width，交给 CSS transition 平移
function syncNavBar() {
  const nav = navRef.value
  if (!nav) return
  const active = nav.querySelector('.nav__item.is-active')
  if (!active) {
    navReady.value = false
    return
  }
  navBar.value = { left: active.offsetLeft, width: active.offsetWidth }
  // 首次定位不要动画，之后才开启 transition
  if (!navReady.value) requestAnimationFrame(() => (navReady.value = true))
}

function hideRecents() {
  showRecents.value = false
}

function onDocMouseDown(event) {
  if (!event.target.closest?.('.search-wrap')) hideRecents()
  if (!event.target.closest?.('.account')) {
    accountOpen.value = false
    accountListOpen.value = false
  }
}

function goSettings() {
  accountOpen.value = false
  router.push('/settings')
}

// 头像菜单里直接切换已保存账号：菜单和设置页共用同一套 store 逻辑
function switchTo(userId) {
  if (String(userId) === String(user.user?.userId)) return
  if (!user.switchAccount(userId)) return
  accountOpen.value = false
  accountListOpen.value = false
  ui.toast('已切换账号')
  setTimeout(() => window.location.reload(), 450)
}

function removeSavedAccount(userId) {
  user.removeAccount(userId)
  ui.toast('已移除该账号')
}

function goLogin() {
  accountOpen.value = false
  accountListOpen.value = false
  router.push('/login')
}

async function doLogout() {
  accountOpen.value = false
  try {
    await logout()
  } catch (err) {
    // 接口失败也照常清本地登录态
  }
  document.cookie = 'MUSIC_U=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
  localStorage.removeItem('cookie:MUSIC_U')
  user.reset()
  ui.toast('已退出登录')
  router.push('/')
}

function pick(word) {
  keyword.value = word
  showRecents.value = false
  submit()
}

function clearRecents() {
  search.clearRecents()
  showRecents.value = false
}

function submit() {
  const word = keyword.value.trim()
  if (!word) return
  router.push({ name: 'search', query: { keywords: word } })
  inputRef.value?.blur()
}

function onMaximized(event, value) {
  maximized.value = value
}

/** 鼠标侧键（后退键） */
function onMouseBack(event) {
  if (event.button === 3 && route.name !== 'home') {
    event.preventDefault()
    goBack(router)
  }
}

function onKeydown(event) {
  if (event.key === 'Escape' && accountOpen.value) {
    accountOpen.value = false
    accountListOpen.value = false
  }
  const tag = document.activeElement?.tagName
  const typing = tag === 'INPUT' || tag === 'TEXTAREA'
  if (typing) return
  if (event.altKey && event.key === 'ArrowLeft') {
    event.preventDefault()
    goBack(router)
    return
  }
  if (event.key === '/' || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k')) {
    event.preventDefault()
    inputRef.value?.focus()
  }
}

onMounted(() => {
  api.onWindowMaximized(onMaximized)
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('mouseup', onMouseBack)
  document.addEventListener('mousedown', onDocMouseDown)
  nextTick(syncNavBar)
  document.fonts?.ready?.then(syncNavBar)
  window.addEventListener('resize', syncNavBar)
  if (route.name === 'search') keyword.value = route.query.keywords || ''
})

watch(
  () => route.fullPath,
  () => {
    keyword.value = route.name === 'search' ? route.query.keywords || '' : ''
    showRecents.value = false
    accountOpen.value = false
    accountListOpen.value = false
  }
)

onBeforeUnmount(() => {
  clearTimeout(suggestTimer)
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('mouseup', onMouseBack)
  document.removeEventListener('mousedown', onDocMouseDown)
  window.removeEventListener('resize', syncNavBar)
})

// 切「我的音乐」内部标签时 name 不变，但高亮项会变，滑块也要跟着重算
watch(() => route.fullPath, () => nextTick(syncNavBar))
</script>

<template>
  <header class="titlebar hb-acrylic">
    <Transition name="back">
      <button v-if="route.name !== 'home'" class="back" title="返回 (Alt + ←)" @click="goBack(router)">
        <Icon name="chevron-left" :size="15" />
      </button>
    </Transition>

    <a class="brand" @click="router.push('/')">
      <span class="brand__mark hb-wordmark" role="img" aria-label="Electron"></span>
      <span class="brand__sub hb-mono">MUSIC</span>
      <span class="brand__ver hb-mono">v{{ version }}</span>
    </a>

    <div class="search-wrap">
      <form class="search" @submit.prevent="submit">
        <Icon name="search" :size="13" />
        <input
          ref="inputRef"
          v-model="keyword"
          type="text"
          placeholder="搜索歌曲 / 歌单 / 歌手"
          spellcheck="false"
          @focus="showRecents = true"
          @click="showRecents = true"
        />
        <span class="search__hint hb-mono">/</span>
      </form>

      <Transition name="fade">
        <div v-if="dropdownOpen" class="recents hb-acrylic">
          <!-- 有关键词：按接口返回推荐搜索条目 -->
          <template v-if="keyword.trim()">
            <div class="recents__head">
              <span class="hb-mono">搜索建议</span>
              <span class="recents__en hb-mono">SUGGEST</span>
            </div>
            <button class="recents__item" @mousedown.prevent="submit()">
              <Icon name="search" :size="11" />
              <span class="recents__word hb-clamp-1">搜索「{{ keyword.trim() }}」</span>
            </button>
            <button
              v-for="(s, i) in suggestions"
              :key="`${s.word}-${i}`"
              class="recents__item"
              @mousedown.prevent="pick(s.word)"
            >
              <Icon name="search" :size="11" />
              <span class="recents__word hb-clamp-1">{{ s.word }}</span>
              <span class="recents__type hb-mono">{{ s.label }}</span>
            </button>
            <p v-if="suggestLoading" class="recents__hint hb-mono">SUGGESTING…</p>
          </template>

          <!-- 无关键词：最近搜索 -->
          <template v-else>
            <div class="recents__head">
              <span class="hb-mono">最近搜索</span>
              <button class="recents__clear hb-mono" @mousedown.prevent="clearRecents">清空</button>
            </div>
            <button
              v-for="word in search.recents"
              :key="word"
              class="recents__item"
              @mousedown.prevent="pick(word)"
            >
              <Icon name="search" :size="11" />
              <span class="recents__word hb-clamp-1">{{ word }}</span>
            </button>
          </template>
        </div>
      </Transition>
    </div>

    <nav ref="navRef" class="nav">
      <RouterLink to="/" class="nav__item" :class="{ 'is-active': route.name === 'home' }">
        首页
      </RouterLink>
      <RouterLink to="/cloud" class="nav__item" :class="{ 'is-active': route.name === 'cloud' }">
        云盘
      </RouterLink>
      <RouterLink to="/my" class="nav__item" :class="{ 'is-active': route.name === 'my' }">
        我的音乐
      </RouterLink>
      <span
        class="nav__bar"
        :class="{ 'is-ready': navReady }"
        :style="{ transform: `translateX(${navBar.left}px)`, width: `${navBar.width}px` }"
      />
    </nav>

    <div class="account">
      <button v-if="!user.loggedIn" class="hb-btn hb-btn--mini" @click="router.push('/login')">
        登录
      </button>
      <template v-else>
        <button
          class="account__chip"
          :class="{ 'is-open': accountOpen }"
          title="账号"
          @click.stop="accountOpen = !accountOpen"
        >
          <img v-if="user.user?.avatarUrl" class="account__avatar" :src="`${user.user.avatarUrl}?param=64y64`" alt="" />
          <span v-else class="account__avatar account__avatar--text">{{ initial }}</span>
          <span class="account__name hb-clamp-1">{{ user.user.nickname }}</span>
          <Icon name="chevron-right" class="account__caret" :size="11" />
        </button>

        <Transition name="fade">
          <div v-if="accountOpen" class="account-menu hb-acrylic" @click.stop>
            <div class="account-menu__head">
              <img v-if="user.user?.avatarUrl" class="account-menu__avatar" :src="`${user.user.avatarUrl}?param=64y64`" alt="" />
              <span v-else class="account-menu__avatar account-menu__avatar--text">{{ initial }}</span>
              <div class="account-menu__id">
                <div class="account-menu__name hb-clamp-1">{{ user.user.nickname }}</div>
                <div class="account-menu__state hb-mono">SIGNED IN</div>
              </div>
            </div>
            <button class="account-menu__item" @click="goSettings">
              <Icon name="settings" :size="14" />
              <span>设置</span>
              <Icon name="chevron-right" :size="11" />
            </button>
            <button
              class="account-menu__item"
              :class="{ 'is-expanded': accountListOpen }"
              @click="accountListOpen = !accountListOpen"
            >
              <Icon name="user" :size="14" />
              <span>切换账号</span>
              <Icon name="chevron-right" class="account-menu__caret" :size="11" />
            </button>
            <Transition name="profile-fade">
              <div v-if="accountListOpen" class="account-menu__list">
                <button
                  v-for="account in user.accounts"
                  :key="account.userId"
                  class="account-menu__account"
                  :class="{ 'is-current': String(account.userId) === String(user.user?.userId) }"
                  @click="switchTo(account.userId)"
                >
                  <img :src="`${account.avatarUrl}?param=48y48`" alt="" />
                  <span class="hb-clamp-1">{{ account.nickname }}</span>
                  <Icon v-if="String(account.userId) === String(user.user?.userId)" name="check" :size="12" />
                  <span
                    v-else
                    class="account-menu__del"
                    title="移除账号"
                    @click.stop="removeSavedAccount(account.userId)"
                  >×</span>
                </button>
                <button class="account-menu__add" @click="goLogin">
                  <Icon name="plus" :size="11" /> 添加账号
                </button>
              </div>
            </Transition>
            <button class="account-menu__item is-danger" @click="doLogout">
              <Icon name="logout" :size="14" />
              <span>退出登录</span>
            </button>
          </div>
        </Transition>
      </template>
    </div>

    <div class="win">
      <button class="win__btn" title="最小化" @click="api.windowMin()">
        <Icon name="min" :size="14" />
      </button>
      <button class="win__btn" title="最大化" @click="api.windowMax()">
        <Icon :name="maximized ? 'restore' : 'max'" :size="12" />
      </button>
      <button class="win__btn win__btn--close" title="关闭" @click="api.windowClose()">
        <Icon name="close" :size="14" />
      </button>
    </div>
  </header>
</template>

<style scoped lang="scss">
.titlebar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: var(--titlebar);
  display: flex;
  align-items: center;
  gap: 26px;
  padding-left: var(--gutter);
  border-bottom: 1px solid var(--line-strong);
  background: var(--titlebar-bg);
  box-shadow: inset 0 1px 0 var(--glass-edge);
  -webkit-app-region: drag;
  z-index: 50;

  > * {
    -webkit-app-region: no-drag;
  }
}

.back {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border: 1px solid var(--line);
  color: var(--ink-soft);
  flex: none;
  transition: background 0.16s, color 0.16s, border-color 0.16s;

  &:hover {
    background: var(--ink);
    color: var(--paper);
    border-color: var(--ink);
  }
}

.brand {
  display: flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
  color: var(--ink);
  flex: none;
  &__bracket {
    font-family: var(--font-mono), monospace;
    font-size: 13px;
    color: var(--faint);
  }

  &__mark {
    height: 15px;
  }

  &__sub {
    margin-left: 6px;
    color: var(--muted);
    font-size: 9px;
    letter-spacing: 0.2em;
  }

  &__ver {
    margin-left: 10px;
    font-size: 8px;
    color: var(--faint);
    border: 1px solid var(--line);
    padding: 1px 5px;
    letter-spacing: 0.06em;
    text-transform: none;
    line-height: 1.5;
  }
}

@media (max-width: 1240px) {
  .brand__ver {
    display: none;
  }

  .search {
    width: 220px;
  }

  .nav {
    gap: 16px;
  }
}

.search {
  width: 300px;
  height: 32px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  border: 1px solid var(--line-strong);
  background: var(--field-bg);
  color: var(--muted);
  transition: border-color 0.18s, background 0.18s, box-shadow 0.18s;

  &:focus-within {
    border-color: var(--ink);
    background: var(--surface);
    box-shadow: 0 0 0 3px var(--hover);
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

  &__hint {
    font-size: 9px;
    color: var(--faint);
    border: 1px solid var(--line);
    padding: 0 4px;
    line-height: 1.5;
  }
}

.nav {
  position: relative;
  display: flex;
  align-items: center;
  gap: 22px;
  margin-left: 4px;

  &__item {
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
    font-size: 13px;
    color: var(--ink-soft);
    padding: 0 0 6px;
    transition: color 0.16s;

    &:hover {
      color: var(--ink);
    }

    &.is-active {
      color: var(--ink);
    }
  }

  /* 下划线是一条独立的滑块，切页时按目标位置平移 */
  &__bar {
    position: absolute;
    left: 0;
    bottom: 0;
    height: 1px;
    background: var(--ink);
    opacity: 0;
    pointer-events: none;
    will-change: transform, width;

    &.is-ready {
      opacity: 1;
      transition: transform 0.36s cubic-bezier(0.16, 1, 0.3, 1),
        width 0.36s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.18s var(--ease);
    }
  }

  &__idx {
    font-size: 9px;
    color: var(--faint);
  }
}

.account {
  position: relative;
  margin-left: auto;

  &__chip {
    display: flex;
    align-items: center;
    gap: 8px;
    max-width: 160px;
    padding: 3px 8px 3px 3px;
    border: 1px solid var(--line);
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
    transition: border-color 0.16s, background 0.16s;

    &:hover,
    &.is-open {
      border-color: var(--line-strong);
      background: var(--hover-surface);
    }
  }

  &__caret {
    transform: rotate(90deg);
    color: var(--faint);
    transition: transform 0.2s var(--ease);

    .is-open & {
      transform: rotate(-90deg);
    }
  }

  &__avatar {
    width: 24px;
    height: 24px;
    object-fit: cover;
    background: var(--paper-deep);

    &--text {
      display: grid;
      place-items: center;
      font-family: var(--font-mono), monospace;
      font-size: 11px;
      color: var(--ink);
    }
  }

  &__name {
    font-size: 12px;
    color: var(--ink-soft);
  }
}

/* 头像下拉：设置 / 退出登录，细线方框，与队列、下载抽屉同一套语言 */
.account-menu {
  position: absolute;
  top: calc(100% + 9px);
  right: 0;
  width: 196px;
  padding: 6px 0;
  background: var(--panel-bg);
  border: 1px solid var(--line-strong);
  box-shadow: var(--shadow);
  z-index: 70;

  &__head {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 12px 12px;
    border-bottom: 1px solid var(--line);
  }

  &__avatar {
    width: 30px;
    height: 30px;
    flex: none;
    object-fit: cover;
    background: var(--paper-deep);

    &--text {
      display: grid;
      place-items: center;
      font-family: var(--font-mono), monospace;
      font-size: 12px;
      color: var(--ink);
    }
  }

  &__id {
    min-width: 0;
  }

  &__name {
    font-size: 12px;
    color: var(--ink);
  }

  &__state {
    margin-top: 3px;
    font-size: 8px;
    letter-spacing: 0.12em;
    color: var(--faint);
  }

  &__item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 12px;
    border: none;
    background: transparent;
    color: var(--ink-soft);
    font: inherit;
    font-size: 12px;
    text-align: left;
    cursor: pointer;
    transition: background 0.14s, color 0.14s;

    > span {
      flex: 1;
    }

    > .hb-icon:last-child {
      color: var(--faint);
    }

    &:hover {
      background: var(--hover);
      color: var(--ink);
    }

    &.is-expanded .account-menu__caret {
      transform: rotate(90deg);
    }

    &.is-danger {
      border-top: 1px solid var(--line-soft);
      color: var(--danger);
    }
  }

  &__caret {
    transition: transform 0.18s var(--ease);
  }

  &__list {
    padding: 4px 6px 6px;
    border-block: 1px solid var(--line-soft);
    background: var(--hover-surface);
    max-height: 220px;
    overflow-y: auto;
  }

  &__account {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 4px;
    border: 0;
    border-radius: 3px;
    background: transparent;
    color: var(--ink-soft);
    font: inherit;
    font-size: 11px;
    text-align: left;
    cursor: pointer;
    transition: background 0.14s, color 0.14s;

    &:hover { background: var(--hover); color: var(--ink); }
    &.is-current { color: var(--accent); }

    img {
      width: 24px;
      height: 24px;
      flex: none;
      border-radius: 50%;
      object-fit: cover;
      background: var(--paper-deep);
    }

    > span.hb-clamp-1 { flex: 1; min-width: 0; }
  }

  &__del {
    flex: none;
    width: 16px;
    text-align: center;
    color: var(--faint);
    font-size: 14px;
    line-height: 1;

    &:hover { color: var(--danger); }
  }

  &__add {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    margin-top: 4px;
    padding: 6px 0 2px;
    border: 0;
    border-top: 1px solid var(--line);
    background: transparent;
    color: var(--muted);
    font: inherit;
    font-size: 10px;
    cursor: pointer;

    &:hover { color: var(--accent); }
  }
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

.hb-btn--mini {
  height: 28px;
  padding: 0 14px;
  font-size: 9px;
}

.win {
  display: flex;
  height: var(--titlebar);

  &__btn {
    width: 46px;
    height: 100%;
    display: grid;
    place-items: center;
    color: var(--ink-soft);
    transition: background 0.14s, color 0.14s;

    &:hover {
      background: var(--hover);
      color: var(--ink);
    }

    &--close:hover {
      background: var(--ink);
      color: var(--paper);
    }
  }
}
.search-wrap {
  position: relative;
  flex: none;
}

.recents {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  width: 300px;
  background: var(--glass-panel);
  border: 1px solid var(--line-strong);
  box-shadow: var(--shadow), inset 0 1px 0 var(--glass-edge);
  padding: 8px 0 6px;
  z-index: 60;
}

.recents__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px 6px;
  color: var(--faint);
}

.recents__clear {
  font-size: 8px;
  color: var(--faint);
}

.recents__clear:hover {
  color: var(--ink);
}

.recents__en {
  font-size: 8px;
  letter-spacing: 0.08em;
  color: var(--faint);
}

.recents__item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 12px;
  text-align: left;
  color: var(--ink-soft);
}

.recents__item:hover {
  background: var(--hover);
  color: var(--ink);
}

.recents__word {
  flex: 1;
  min-width: 0;
  font-size: 12px;
}

.recents__type {
  flex: none;
  font-size: 8px;
  color: var(--faint);
  border: 1px solid var(--line);
  padding: 1px 4px;
  line-height: 1.4;
}

.recents__hint {
  padding: 4px 12px 2px;
  font-size: 8px;
  color: var(--faint);
}

@media (max-width: 1240px) {
  .recents {
    width: 220px;
  }
}
/* 返回键：宽度收放 + 淡入左移，避免品牌字标位置硬跳 */
.back-enter-active,
.back-leave-active {
  overflow: hidden;
  transition: width 0.24s var(--ease), margin-left 0.24s var(--ease),
    border-width 0.24s var(--ease), opacity 0.16s var(--ease),
    transform 0.24s var(--ease);
}

.back-enter-from,
.back-leave-to {
  width: 0;
  margin-left: -26px;
  border-width: 0;
  opacity: 0;
  transform: translateX(-8px);
}
</style>
