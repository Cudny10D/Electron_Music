<script setup>
import { computed, ref, watch } from 'vue'
import api from '../utils/windowApi'
import { getCookie } from '../utils/authority'
import { useUiStore } from '../store/uiStore'
import {
  createPlaylist,
  updatePlaylist,
  updatePlaylistInfo,
  updatePlaylistName,
  updatePlaylistDesc,
  updatePlaylistCover
} from '../api/playlist'
import { search } from '../api/other'
import { formatBytes } from '../utils/format'
import Icon from './Icon.vue'

const props = defineProps({
  mode: { type: String, required: true }, // create | edit | add
  playlist: { type: Object, default: null }
})
const emit = defineEmits(['close', 'saved'])

const ui = useUiStore()
const busy = ref(false)
const error = ref('')

const name = ref('')
const desc = ref('')
const tags = ref('')
const privacy = ref(false)
const cover = ref(null)

const keyword = ref('')
const results = ref([])
const selected = ref([])
const searched = ref(false)

const title = computed(() => ({
  create: '新建歌单',
  edit: '编辑歌单',
  add: '添加歌曲到歌单'
}[props.mode] || '歌单'))

watch(
  () => [props.mode, props.playlist?.id],
  () => {
    error.value = ''
    cover.value = null
    results.value = []
    selected.value = []
    keyword.value = ''
    searched.value = false
    if (props.mode === 'edit') {
      name.value = props.playlist?.name || ''
      desc.value = props.playlist?.description || ''
      tags.value = (props.playlist?.tags || []).join(';')
    } else {
      name.value = ''
      desc.value = ''
      tags.value = ''
      privacy.value = false
    }
  },
  { immediate: true }
)

function close() {
  if (busy.value) return
  emit('close')
}

async function pickCover() {
  const picked = await api.pickCoverImage()
  if (!picked) return
  if (picked.error) {
    ui.toast(picked.error, 'error')
    return
  }
  cover.value = picked
}

async function submitCreate() {
  const value = name.value.trim()
  if (!value) return (error.value = '请填写歌单名称')
  busy.value = true
  error.value = ''
  try {
    const res = await createPlaylist({ name: value, privacy: privacy.value ? 10 : 0 })
    const created = res?.playlist || { id: res?.id, name: value }
    ui.toast(`歌单「${value}」已创建`)
    emit('saved', { mode: 'create', playlist: created })
  } catch (err) {
    error.value = err?.response?.data?.message || err?.message || '创建失败，请确认已登录'
  } finally {
    busy.value = false
  }
}

async function submitEdit() {
  const value = name.value.trim()
  if (!value) return (error.value = '请填写歌单名称')
  const id = props.playlist?.id
  if (!id) return (error.value = '缺少歌单 id')
  busy.value = true
  error.value = ''
  try {
    try {
      await updatePlaylistInfo({ id, name: value, desc: desc.value.trim(), tags: tags.value.trim() })
    } catch (err) {
      // batch 接口偶发失败，拆成单接口兜底
      await updatePlaylistName({ id, name: value })
      await updatePlaylistDesc({ id, desc: desc.value.trim() })
    }
    if (cover.value) {
      const cookie = getCookie('MUSIC_U') ? `MUSIC_U=${getCookie('MUSIC_U')};` : ''
      const res = await updatePlaylistCover({ id, ...cover.value }, cookie)
      if (res?.code !== 200) ui.toast('名称已保存，但封面上传失败（可稍后重试）', 'error')
    }
    ui.toast(cover.value ? '歌单信息已更新' : '歌单信息已保存')
    emit('saved', { mode: 'edit', name: value, desc: desc.value.trim(), coverUrl: cover.value?.dataUrl || '' })
  } catch (err) {
    error.value = err?.response?.data?.message || err?.message || '保存失败'
  } finally {
    busy.value = false
  }
}

async function doSearch() {
  const q = keyword.value.trim()
  if (!q) return
  busy.value = true
  error.value = ''
  try {
    const res = await search({ keywords: q, type: 1, limit: 30 })
    results.value = res?.result?.songs || res?.songs || []
    selected.value = []
    searched.value = true
    if (!results.value.length) error.value = '没有找到相关歌曲'
  } catch (err) {
    error.value = err?.message || '搜索失败'
  } finally {
    busy.value = false
  }
}

function toggleSelect(id) {
  const i = selected.value.indexOf(id)
  if (i >= 0) selected.value.splice(i, 1)
  else selected.value.push(id)
}

async function submitAdd() {
  const pid = props.playlist?.id
  if (!pid) return (error.value = '缺少歌单 id')
  if (!selected.value.length) return (error.value = '请先选择要添加的歌曲')
  busy.value = true
  error.value = ''
  try {
    const res = await updatePlaylist({ op: 'add', pid, tracks: selected.value.join(',') })
    if (res?.code && res.code !== 200) throw new Error(res?.message || res?.msg || '添加失败')
    ui.toast(`已添加 ${selected.value.length} 首到歌单`)
    emit('saved', { mode: 'add', ids: [...selected.value] })
  } catch (err) {
    error.value = err?.response?.data?.message || err?.message || '添加失败，请确认已登录且是自己的歌单'
  } finally {
    busy.value = false
  }
}

function submit() {
  if (props.mode === 'create') return submitCreate()
  if (props.mode === 'edit') return submitEdit()
  if (props.mode === 'add') return submitAdd()
}

const coverPreview = computed(() => cover.value?.dataUrl || '')
</script>

<template>
  <div class="pm-overlay" @mousedown.self="close">
    <div class="pm hb-acrylic" role="dialog">
      <header class="pm__head">
        <div>
          <span class="hb-label">PLAYLIST / {{ mode.toUpperCase() }}</span>
          <h2 class="pm__title hb-display">{{ title }}</h2>
        </div>
        <button class="hb-icon-btn" title="关闭" @click="close"><Icon name="close" :size="16" /></button>
      </header>

      <!-- 新建 -->
      <template v-if="mode === 'create'">
        <label class="pm__field">
          <span class="pm__label hb-label">名称</span>
          <input v-model="name" class="pm__input" maxlength="40" placeholder="给歌单起个名字" @keyup.enter="submit" />
        </label>
        <label class="pm__check">
          <input v-model="privacy" type="checkbox" />
          <span>设为隐私歌单</span>
        </label>
      </template>

      <!-- 编辑 -->
      <template v-else-if="mode === 'edit'">
        <label class="pm__field">
          <span class="pm__label hb-label">名称</span>
          <input v-model="name" class="pm__input" maxlength="40" placeholder="歌单名称" />
        </label>
        <label class="pm__field">
          <span class="pm__label hb-label">简介</span>
          <textarea v-model="desc" class="pm__input pm__input--area" maxlength="300" placeholder="写点介绍…" />
        </label>
        <label class="pm__field">
          <span class="pm__label hb-label">标签（分号分隔）</span>
          <input v-model="tags" class="pm__input" placeholder="流行; 日语; 治愈" />
        </label>
        <div class="pm__cover">
          <div class="pm__cover-preview hb-frame">
            <img v-if="coverPreview" :src="coverPreview" alt="" />
            <Icon v-else name="album" :size="22" />
          </div>
          <div class="pm__cover-meta">
            <span class="pm__label hb-label">封面</span>
            <button class="hb-btn" @click="pickCover"><Icon name="folder" :size="12" /> 选择图片</button>
            <span class="pm__hint hb-mono">{{ cover ? `${cover.name} · ${formatBytes(Math.round(cover.dataUrl.length * 0.75))}` : 'JPG / PNG / WEBP，≤ 8 MB' }}</span>
          </div>
        </div>
      </template>

      <!-- 添加歌曲 -->
      <template v-else>
        <div class="pm__search">
          <input v-model="keyword" class="pm__input" placeholder="搜索歌曲名 / 歌手" @keyup.enter="doSearch" />
          <button class="hb-btn" :disabled="busy" @click="doSearch"><Icon name="search" :size="12" /> 搜索</button>
        </div>
        <div v-if="results.length" class="pm__results hb-scroll">
          <button
            v-for="song in results"
            :key="song.id"
            class="pm__result"
            :class="{ 'is-selected': selected.includes(song.id) }"
            @click="toggleSelect(song.id)"
          >
            <span class="pm__box"><Icon v-if="selected.includes(song.id)" name="check" :size="11" /></span>
            <span class="pm__result-main">
              <span class="pm__result-name hb-clamp-1">{{ song.name }}</span>
              <span class="pm__result-sub hb-clamp-1">{{ (song.ar || song.artists || []).map(a => a.name).join(' / ') || song.al?.name || '—' }}</span>
            </span>
          </button>
        </div>
        <p v-else-if="searched && !error" class="pm__empty">换个关键词试试</p>
        <div class="pm__selected hb-mono">已选 {{ selected.length }} 首</div>
      </template>

      <p v-if="error" class="pm__error hb-mono">{{ error }}</p>

      <footer class="pm__foot">
        <button class="hb-btn" @click="close">取消</button>
        <button class="hb-btn hb-btn--solid" :disabled="busy" @click="submit">
          {{ busy ? '处理中…' : mode === 'add' ? '添加所选' : '保存' }}
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped lang="scss">
.pm-overlay {
  position: fixed;
  inset: 0;
  z-index: 120;
  display: grid;
  place-items: center;
  background: rgba(12, 12, 9, 0.46);
  -webkit-app-region: no-drag;
}

.pm {
  position: relative;
  width: min(480px, calc(100vw - 80px));
  max-height: calc(100vh - 120px);
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 20px 22px 18px;
  background: var(--panel-bg);
  border: 1px solid var(--line-strong);
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.32);

  &__head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--line);
  }

  &__title {
    font-size: 24px;
    margin-top: 5px;
  }

  &__field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  &__label {
    font-size: 8px;
  }

  &__input {
    width: 100%;
    height: 34px;
    padding: 0 10px;
    border: 1px solid var(--line-strong);
    background: var(--field-bg);
    color: var(--ink);
    font: inherit;
    font-size: 12px;
    outline: none;

    &:focus {
      border-color: var(--ink);
    }

    &--area {
      height: 68px;
      padding: 8px 10px;
      resize: none;
      line-height: 1.6;
    }
  }

  &__check {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    color: var(--ink-soft);
  }

  &__cover {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  &__cover-preview {
    width: 76px;
    height: 76px;
    flex: none;
    display: grid;
    place-items: center;
    overflow: hidden;
    border: 1px solid var(--line);
    background: var(--surface);
    color: var(--faint);

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  }

  &__cover-meta {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 7px;
    min-width: 0;
  }

  &__hint {
    font-size: 8px;
    color: var(--faint);
  }

  &__search {
    display: flex;
    gap: 8px;
  }

  &__results {
    max-height: 260px;
    min-height: 80px;
    overflow-y: auto;
    border: 1px solid var(--line);
  }

  &__result {
    width: 100%;
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr);
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border: none;
    border-bottom: 1px solid var(--line-soft);
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;

    &:hover {
      background: var(--hover);
    }

    &.is-selected {
      background: var(--accent-weak);
    }
  }

  &__box {
    width: 14px;
    height: 14px;
    display: grid;
    place-items: center;
    border: 1px solid var(--line-strong);
    color: var(--on-accent);
  }

  .is-selected &__box {
    background: var(--accent);
    border-color: var(--accent);
  }

  &__result-main {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  &__result-name {
    font-size: 12px;
    color: var(--ink);
  }

  &__result-sub {
    font-size: 10px;
    color: var(--muted);
  }

  &__empty {
    padding: 20px 0;
    text-align: center;
    font-size: 11px;
    color: var(--muted);
  }

  &__selected {
    font-size: 9px;
    color: var(--muted);
  }

  &__error {
    font-size: 10px;
    color: var(--danger);
    line-height: 1.5;
  }

  &__foot {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding-top: 12px;
    border-top: 1px solid var(--line);
  }
}
</style>
