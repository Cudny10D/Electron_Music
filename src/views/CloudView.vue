<script setup>
/**
 * 云盘 —— 按 Hydrogen-Music 5.0 的 CloudDisk + CloudFileList 结构移植。
 * 左栏：标题 / 6 分类网格（选中角标框动画）/ 云盘信息 / 上传区（旋转虚线环 + 上传中斜纹）；
 * 右栏：文件列表（封面 + 歌名(文件名) + 时间·大小 + 勾选框），选中后右侧滑出操作栏。
 * 数据用法对齐源码：/user/cloud 顶层返回 count / size / maxSize / data[]。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { getUserCloud, deleteUserCloud, uploadCloud } from '../api/cloud'
import { useUserStore } from '../store/userStore'
import { useUiStore } from '../store/uiStore'
import { playList } from '../utils/player'
import { downloadSongs } from '../utils/download'
import Icon from '../components/Icon.vue'

const user = useUserStore()
const ui = useUiStore()
const router = useRouter()

const CATEGORIES = [
  { id: 1, label: '全部', icon: 'folder' },
  { id: 2, label: '图片', icon: 'image' },
  { id: 3, label: '音乐', icon: 'music' },
  { id: 4, label: '视频', icon: 'video' },
  { id: 5, label: '压缩包', icon: 'archive' },
  { id: 6, label: '文档', icon: 'doc' }
]

const typeSelect = ref(1)
const clouds = ref([])
const count = ref(null)
const sizeGB = ref(null) // 已用容量（G），源码按字符串保留一位小数
const maxSizeGB = ref(null) // 总容量（G）
const loading = ref(false)
const error = ref('')
const keyword = ref('')
const isUploading = ref(false)
const uploadInput = ref(null)
const selected = ref(new Set())
const confirmDelete = ref(false)
let seq = 0

/** 接口条目 -> 可播放歌曲 */
function toSong(item) {
  const s = item.simpleSong || {}
  return {
    ...s,
    id: s.id || item.songId,
    name: s.name || item.songName || '未命名歌曲',
    ar: s.ar || (item.artist ? [{ name: item.artist }] : []),
    al: s.al || { name: item.album || '—', id: item.albumId, picUrl: item.picUrl || '' },
    dt: s.dt || 0
  }
}

const rows = computed(() => clouds.value.map((item, index) => ({ item, index, song: toSong(item) })))

const visibleRows = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  // 网易云盘仅存音乐：源码里非「全部/音乐」分类也不加载列表，这里显示空态
  const categoryHit = typeSelect.value === 1 || typeSelect.value === 3
  if (!categoryHit) return []
  return rows.value.filter(({ song, item }) =>
    [song.name, item.fileName, song.ar?.map((a) => a.name).join(' '), song.al?.name]
      .filter(Boolean)
      .some((text) => String(text).toLowerCase().includes(q))
  )
})

const lastAdded = computed(() => {
  const first = visibleRows.value[0]?.item || clouds.value[0]
  if (!first) return '—'
  return fullTime(first.addTime)
})

const capacityLabel = computed(() => {
  const used = sizeGB.value ?? '0.0'
  const max = maxSizeGB.value ?? 60
  return `${used}G / ${max}G`
})

const capacityPercent = computed(() => {
  const used = Number(sizeGB.value || 0)
  const max = Number(maxSizeGB.value || 0) || 60
  return Math.min(100, (used / max) * 100)
})

function fullTime(ms) {
  const raw = Number(ms || 0)
  if (!raw) return '—'
  const d = new Date(raw > 1e12 ? raw : raw * 1000)
  if (Number.isNaN(d.getTime())) return '—'
  const p = (v) => String(v).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function sizeLabel(bytes) {
  const n = Number(bytes || 0)
  return n > 0 ? `${(n / 1024 / 1024).toFixed(1)}MB` : '—'
}

async function typeChange(num) {
  typeSelect.value = num
  if (num !== 1 && num !== 3) return
  await load()
}

async function load() {
  if (!user.loggedIn || loading.value) return
  const mySeq = ++seq
  loading.value = true
  error.value = ''
  try {
    const res = await getUserCloud({ limit: 500, offset: 0, timestamp: Date.now() })
    if (mySeq !== seq) return
    // 源码直接取顶层 count/size/maxSize/data；兼容 { data: { clouds, cloudCount } } 结构
    const list = Array.isArray(res?.data)
      ? res.data
      : Array.isArray(res?.data?.clouds) ? res.data.clouds : []
    clouds.value = list
    count.value = res?.count ?? res?.data?.cloudCount ?? list.length
    const sizeBytes = res?.size ?? res?.data?.size ?? 0
    const maxBytes = res?.maxSize ?? res?.data?.maxSize ?? 0
    sizeGB.value = (sizeBytes / 1024 / 1024 / 1024).toFixed(1)
    maxSizeGB.value = maxBytes ? Number((maxBytes / 1024 / 1024 / 1024).toFixed(1)) : 60
    selected.value = new Set()
  } catch (err) {
    if (mySeq === seq) error.value = err?.message || '云盘加载失败'
  } finally {
    if (mySeq === seq) loading.value = false
  }
}

function reload() {
  load()
}

function play(id, index) {
  const list = rows.value.map((r) => r.song)
  if (!list.length) return
  const realIndex = list.findIndex((s) => s.id === id)
  playList(list, realIndex >= 0 ? realIndex : index, { kind: 'cloud', name: '我的云盘' })
}

function isSelected(id) {
  return selected.value.has(id)
}

function fileEdit(song) {
  const next = new Set(selected.value)
  if (next.has(song.id)) next.delete(song.id)
  else next.add(song.id)
  selected.value = next
}

function clearSelect() {
  selected.value = new Set()
}

function selectedSongs() {
  return rows.value.filter((r) => selected.value.has(r.song.id)).map((r) => r.song)
}

function downloadSelected() {
  const songs = selectedSongs()
  if (!songs.length) return
  downloadSongs(songs)
  ui.toast(`已加入下载队列：${songs.length} 首`)
  clearSelect()
}

async function deleteSelected() {
  const picked = rows.value.filter((r) => selected.value.has(r.song.id))
  confirmDelete.value = false
  if (!picked.length) return
  const ids = picked.map((r) => r.song.id).join(',')
  try {
    const res = await deleteUserCloud(ids)
    if (res?.code !== 200) {
      ui.toast(res?.message || '删除失败')
      return
    }
    clouds.value = clouds.value.filter((c) => !picked.some((r) => r.item === c))
    count.value = Math.max(0, Number(count.value || 0) - picked.length)
    clearSelect()
    ui.toast('已从云盘删除')
  } catch (err) {
    ui.toast(err?.message || '删除失败')
  }
}

function uploadFile() {
  if (!user.loggedIn || isUploading.value) return
  uploadInput.value?.click()
}

const fileFailCount = new Map()

async function uploadOne(file, index, total) {
  const tries = fileFailCount.get(file.name) || 0
  try {
    const res = await uploadCloud(file)
    if (res?.code === 200) {
      fileFailCount.delete(file.name)
      ui.toast(`${file.name} 上传成功`)
      if (index >= total) {
        isUploading.value = false
        ui.toast('上传完毕，转码完成后请刷新查看')
        await nextTick()
        load()
      }
      return
    }
  } catch (err) {
    // 走重试
  }
  const next = tries + 1
  fileFailCount.set(file.name, next)
  if (next >= 4) {
    ui.toast(`上传失败：${file.name}`, 'error')
    if (index >= total) isUploading.value = false
    return
  }
  ui.toast(`${file.name} 失败 ${next} 次，重试中`, 'error')
  await uploadOne(file, index, total)
}

function onFiles(event) {
  const files = Array.from(event.target.files || [])
  event.target.value = ''
  if (!files.length) return
  isUploading.value = true
  files.forEach((file, i) => uploadOne(file, i + 1, files.length))
}

onMounted(() => {
  if (user.loggedIn) typeChange(1)
})

onBeforeUnmount(() => {
  seq += 1
})
</script>

<template>
  <div class="cloud">
    <input
      ref="uploadInput"
      class="cloud__native-file"
      type="file"
      accept=".mp3,.aac,.wma,.wav,.ogg,.m4a,.ape,.flac,.cue"
      multiple
      @change="onFiles"
    />

    <section v-if="!user.loggedIn" class="cloud__guest hb-acrylic">
      <span class="hb-label">ACCOUNT</span>
      <h2 class="cloud__guest-title hb-display">登录后查看云盘</h2>
      <p class="cloud__guest-desc">你在网易云音乐上传的歌曲会同步显示在这里。</p>
      <button class="hb-btn hb-btn--solid" @click="router.push('/login')">扫码登录</button>
    </section>

    <div v-else class="cloud-disk">
      <!-- 左栏 -->
      <div class="disk-left">
        <div class="disk-title">
          <span class="title-tip" />
          <span class="title-name hb-display">我的云盘</span>
          <button class="disk-refresh hb-mono" :disabled="loading" title="刷新云盘" @click="reload">REFRESH</button>
        </div>

        <div class="disk-tab hb-acrylic">
          <!-- 背景水印 -->
          <span class="tab-back1" aria-hidden="true" />
          <span class="tab-back2 hb-display" aria-hidden="true">INFO</span>

          <div class="file-type">
            <button
              v-for="cat in CATEGORIES"
              :key="cat.id"
              class="type"
              :class="{ 'is-active': typeSelect === cat.id }"
              @click="typeChange(cat.id)"
            >
              <span class="type-icon">
                <Icon :name="cat.icon" :size="27" :weight="1.3" />
                <span class="type-select" :class="{ 'type-selected': typeSelect === cat.id }" aria-hidden="true">
                  <i v-for="n in 4" :key="n" />
                </span>
              </span>
              <span class="type-name">{{ cat.label }}</span>
            </button>
          </div>

          <div class="disk-info">
            <div class="info-container">
              <div class="info-title">云盘信息</div>
              <div class="info-list">
                <div class="info-item">
                  <span class="item-lable">当前用户</span>
                  <span class="item-info">{{ user.user?.nickname || '—' }}</span>
                </div>
                <div class="info-item">
                  <span class="item-lable">云盘容量</span>
                  <span class="disk-capacity">
                    <span class="capacity">
                      <span class="capacity-fill" :style="{ width: `${capacityPercent}%` }" />
                    </span>
                    <span class="capacity-num hb-mono">{{ capacityLabel }}</span>
                  </span>
                </div>
                <div class="info-item">
                  <span class="item-lable">文件数量</span>
                  <span class="item-info">{{ count ?? 0 }} 个</span>
                </div>
                <div class="info-item">
                  <span class="item-lable">上次添加</span>
                  <span class="item-info hb-mono">{{ lastAdded }}</span>
                </div>
              </div>
              <div class="info-footer">
                <span class="footer-line" />
                <span class="footer-title hb-mono">MUSICCLOUD INFO</span>
              </div>
            </div>
          </div>
        </div>

        <div class="disk-upload hb-acrylic" @click="uploadFile">
          <Transition name="upload-fade">
            <div v-show="!isUploading" class="upload">
              <span class="upload-icon">
                <span class="upload-ring" aria-hidden="true" />
                <Icon name="upload" :size="20" :weight="1.4" />
              </span>
              <span class="upload-title">上传</span>
            </div>
          </Transition>
          <Transition name="upload-fade">
            <div v-show="isUploading" class="upload-animation">
              <span class="uploading-title">上传中...</span>
              <span class="uploading-subtitle">上传完成后可能需要转码，请稍后刷新查看</span>
              <span class="animation" />
            </div>
          </Transition>
        </div>
      </div>

      <!-- 右栏 -->
      <div class="disk-right">
        <div class="file-container">
          <div class="file-list hb-scroll" :class="{ 'file-list-selected': selected.size !== 0 }">
            <div
              v-for="(row, index) in visibleRows"
              :key="row.song.id || row.index"
              class="list-item"
              @dblclick="play(row.song.id, index)"
            >
              <div class="item-info">
                <span class="item-img" :class="{ 'is-selected': isSelected(row.song.id) }" @click="fileEdit(row.song)">
                  <img
                    v-if="row.song.al?.picUrl"
                    :src="`${row.song.al.picUrl}?param=90y90`"
                    alt=""
                    loading="lazy"
                  />
                  <span v-else class="item-img-ph"><Icon name="music" :size="16" /></span>
                </span>
                <span class="info">
                  <span class="item-name hb-clamp-1">
                    {{ row.item.songName || row.song.name }}
                    <span class="item-name2">({{ row.item.fileName || row.song.name }})</span>
                  </span>
                  <span class="item-other hb-mono">
                    <span class="item-time">{{ fullTime(row.item.addTime) }}</span>
                    <span class="item-size">{{ sizeLabel(row.item.fileSize) }}</span>
                  </span>
                </span>
              </div>
              <span
                class="item-check"
                :class="{ 'item-check-selected': isSelected(row.song.id) }"
                @click="fileEdit(row.song)"
              >
                <Icon name="check" :size="9" :weight="2.4" />
              </span>
            </div>

            <div v-if="loading && !clouds.length" class="cloud__state hb-mono">LOADING…</div>
            <div v-else-if="error" class="cloud__state hb-mono">{{ error }}</div>
            <div v-else-if="!visibleRows.length" class="cloud__state hb-mono">
              {{ keyword ? '没有匹配的文件' : typeSelect !== 1 && typeSelect !== 3 ? '该分类暂无文件' : '云盘还是空的' }}
            </div>
          </div>

          <div class="file-edit" :class="{ 'file-edit-selected': selected.size !== 0 }">
            <button class="edit-item" @click="clearSelect()">
              <Icon name="close" :size="18" /> <span>全部取消</span>
            </button>
            <button class="edit-item" @click="downloadSelected()">
              <Icon name="download" :size="18" /> <span>下载</span>
            </button>
            <button class="edit-item edit-item--danger" @click="confirmDelete = true">
              <Icon name="trash" :size="18" /> <span>删除</span>
            </button>
          </div>
        </div>
      </div>

      <!-- 删除确认 -->
      <Transition name="upload-fade">
        <div v-if="confirmDelete" class="confirm hb-acrylic">
          <span class="hb-label">CONFIRM</span>
          <p>确定要从云盘中删除选中的 {{ selected.size }} 首歌曲吗？</p>
          <div class="confirm__actions">
            <button class="hb-btn hb-btn--mini" @click="confirmDelete = false">取消</button>
            <button class="hb-btn hb-btn--mini confirm__danger" @click="deleteSelected">删除</button>
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped lang="scss">
.cloud {
  width: 100%;
  max-width: var(--page-max);
  margin-inline: auto;
  padding: 30px var(--gutter) 60px;
}

.cloud__native-file { display: none; }

.cloud-disk {
  position: relative;
  display: flex;
  flex-direction: row;
  gap: 40px;
  // 对齐源码的高度自适应：随窗口伸缩，上传区始终完整可见
  height: calc(100vh - 208px);
  min-height: 520px;
  max-height: 760px;
}

/* ---------- 左栏 ---------- */
.disk-left {
  width: 55%;
  max-width: 450px;
  flex: none;
  display: flex;
  flex-direction: column;
}

.disk-title {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 8px;

  .title-tip { width: 6px; height: 6px; background: var(--ink); }
  .title-name { font-size: 15px; color: var(--ink); }
}

.disk-refresh {
  margin-left: auto;
  border: 0;
  background: transparent;
  color: var(--faint);
  font-size: 8px;
  letter-spacing: 0.1em;
  cursor: pointer;
  &:hover { color: var(--accent); }
}

.disk-tab {
  position: relative;
  flex: 1;
  min-height: 0;
  border-radius: 3px;
  overflow: hidden;
}

.file-type {
  height: 55%;
  padding: 20px 12px 8px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  align-content: space-evenly;
}

.type {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 6px;
  border: 0;
  background: transparent;
  color: var(--muted);
  font: inherit;
  cursor: pointer;
  transition: color 0.2s;

  &:hover, &.is-active { color: var(--ink); }
}

.type-icon {
  position: relative;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
}

.type-select {
  position: absolute;
  inset: -8px;
  opacity: 0;
  pointer-events: none;

  i {
    position: absolute;
    width: 10px;
    height: 10px;
    border-color: var(--accent);
    border-style: solid;
    border-width: 0;
  }
  i:nth-child(1) { top: 0; left: 0; border-top-width: 1px; border-left-width: 1px; }
  i:nth-child(2) { top: 0; right: 0; border-top-width: 1px; border-right-width: 1px; }
  i:nth-child(3) { bottom: 0; left: 0; border-bottom-width: 1px; border-left-width: 1px; }
  i:nth-child(4) { bottom: 0; right: 0; border-bottom-width: 1px; border-right-width: 1px; }
}

.type-selected {
  animation: type-selected 0.35s ease-out forwards;
}

@keyframes type-selected {
  0% { inset: -14px; opacity: 0; }
  40% { inset: -6px; opacity: 0.85; }
  60% { inset: -6px; opacity: 0.85; }
  100% { inset: -9px; opacity: 0.85; }
}

.type-name { font-size: 11px; }

.disk-info {
  height: 45%;
  padding: 0 10px 10px;
}

.info-container {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;
  padding: 6px 9px;
  background: var(--hover);
  border-radius: 2px;
}

.info-title {
  align-self: flex-start;
  padding: 2px 5px;
  background: #161614;
  color: #f2efe6;
  font-size: 8px;
  letter-spacing: 0.08em;
}

.info-list {
  display: flex;
  flex-direction: column;
  justify-content: space-evenly;
  height: 100%;
  padding: 0 3px;
}

.info-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;

  .item-lable { flex: none; color: var(--muted); white-space: nowrap; }
  .item-info { color: var(--ink); font-size: 10px; word-break: break-all; }
}

.disk-capacity {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;

  .capacity {
    flex: 1;
    height: 6px;
    border: 1px solid var(--line-strong);
    background: var(--line-soft);
  }
  .capacity-fill {
    display: block;
    height: 100%;
    background: var(--accent);
    transition: width 0.5s;
  }
  .capacity-num { flex: none; font-size: 9px; color: var(--ink); white-space: nowrap; }
}

.info-footer {
  .footer-line { display: block; height: 1px; background: var(--line-strong); }
  .footer-title { display: block; margin-top: 3px; text-align: right; font-size: 7px; color: var(--faint); }
}

.tab-back1 {
  position: absolute;
  top: 10px;
  left: 10px;
  width: 15px;
  height: 15px;
  border: 1px solid var(--muted);
  border-radius: 50%;
  opacity: 0.5;
  pointer-events: none;
  &::after { content: ''; position: absolute; inset: 3px; border: 1px solid var(--muted); border-radius: 50%; }
}

.tab-back2 {
  position: absolute;
  top: 0;
  right: 10px;
  font-size: 34px;
  letter-spacing: 0.02em;
  color: var(--ink);
  opacity: 0.1;
  pointer-events: none;
}

.disk-upload {
  flex: 0 0 22%;
  min-height: 92px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 10px;
  border-radius: 3px;
  cursor: pointer;
  overflow: hidden;
  transition: background 0.2s;
  &:hover { background: var(--hover); }
}

.upload {
  display: flex;
  align-items: center;
  gap: 12px;
}

.upload-icon {
  position: relative;
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  color: var(--muted);
}

.upload-ring {
  position: absolute;
  inset: 0;
  border: 1px dashed var(--line-strong);
  border-radius: 50%;
  animation: upload-spin 12s linear infinite;
}

@keyframes upload-spin { to { transform: rotate(360deg); } }

.upload-title { font-size: 15px; font-weight: 300; color: var(--muted); }

.upload-animation {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  height: 100%;
  position: relative;
  background: repeating-linear-gradient(
    135deg,
    transparent 0 8px,
    var(--hover) 8px 16px
  );
  background-size: 200% 200%;
  animation: upload-bg 8s linear infinite;

  .uploading-title { font-size: 15px; font-weight: 300; color: var(--muted); }
  .uploading-subtitle { font-size: 10px; color: var(--faint); }
  .animation {
    position: absolute;
    top: 0;
    left: 10%;
    width: 10%;
    height: 1px;
    background: var(--accent);
    animation: upload-scan 3s infinite;
  }
}

@keyframes upload-bg { to { background-position: 100% 100%; } }
@keyframes upload-scan {
  0% { width: 0; left: 120%; }
  40% { width: 150%; left: 120%; }
  65% { width: 0; left: -30%; }
  85% { width: 60%; }
  100% { width: 0; left: 120%; }
}

.upload-fade-enter-active, .upload-fade-leave-active { transition: 0.3s cubic-bezier(.14,.91,.58,1); }
.upload-fade-enter-from, .upload-fade-leave-to { transform: scale(0.94); opacity: 0; }

/* ---------- 右栏 ---------- */
.disk-right {
  flex: 1;
  min-width: 0;
  padding-top: 1px;
}

.file-container { position: relative; height: 100%; }

.file-list {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
  transition: width 0.3s;
}

.file-list-selected { width: calc(100% - 96px); }

.list-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 2px 12px;
  margin-bottom: 10px;
  border-bottom: 1px solid var(--line-soft);
  cursor: default;

  &:last-child { margin-bottom: 0; border-bottom: 0; }
}

.item-info {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  width: 95%;
}

.item-img {
  flex: none;
  width: 40px;
  height: 40px;
  border: 1px solid var(--line-soft);
  cursor: pointer;

  img { width: 100%; height: 100%; object-fit: cover; display: block; }

  &.is-selected { outline: 1px solid var(--accent); outline-offset: 1px; }
}

.item-img-ph {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  background: #262522;
  color: #f2efe6;
}

.info { display: flex; flex-direction: column; gap: 5px; min-width: 0; text-align: left; }

.item-name { font-size: 13px; color: var(--ink); }
.item-name2 { font-size: 11px; color: var(--muted); }

.item-other { display: flex; gap: 10px; font-size: 9px; color: var(--faint); }

.item-check {
  flex: none;
  position: relative;
  width: 12px;
  height: 12px;
  border: 1px solid var(--line-strong);
  cursor: pointer;

  svg { position: absolute; inset: 0; opacity: 0; color: var(--surface); }
}

.item-check-selected {
  background: var(--accent);
  border-color: var(--accent);
  svg { opacity: 1; }
}

.file-edit {
  position: absolute;
  top: 0;
  right: -120px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding-top: 8px;
  transition: right 0.3s;
}

.file-edit-selected { right: 0; }

.edit-item {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: opacity 0.2s, color 0.2s;
  &:hover { opacity: 0.6; color: var(--ink); }
  &.edit-item--danger:hover { color: #d05a5a; }
}

.cloud__state { padding: 60px 0; text-align: center; font-size: 10px; letter-spacing: 0.12em; color: var(--faint); }

.confirm {
  position: absolute;
  top: 40%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 5;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 240px;
  padding: 18px;
  border-radius: 3px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
  p { margin: 0; font-size: 12px; color: var(--ink); }
}

.confirm__actions { display: flex; justify-content: flex-end; gap: 8px; }
.confirm__danger { color: #d05a5a; }

.cloud__guest {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 14px;
  padding: 60px 54px;
  border-radius: 4px;
}
.cloud__guest-title { font-size: 26px; }
.cloud__guest-desc { font-size: 12px; color: var(--muted); }

@media (max-width: 860px) {
  .cloud-disk { flex-direction: column; gap: 18px; }
  .disk-left { width: 100%; max-width: none; }
}
</style>
