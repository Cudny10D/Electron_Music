<script setup>
import { computed, onMounted } from 'vue'
import { useLocalStore } from '../store/localStore'
import { formatBytes } from '../utils/format'
import SongTable from './SongTable.vue'
import Icon from './Icon.vue'

const local = useLocalStore()

const downloaded = computed(() => local.downloadedFiles)
const own = computed(() => local.localFiles)

const groupSize = (list) => formatBytes(list.reduce((acc, f) => acc + (f.size || 0), 0))

function addFolders() {
  local.addFolders()
}

onMounted(() => {
  if (!local.files.length && !local.scanning) local.scan()
})
</script>

<template>
  <section class="local">
    <header class="local__head">
      <div>
        <span class="hb-label">LOCAL / 本地音乐</span>
        <h2 class="local__title hb-display">本地与下载</h2>
        <div class="local__sub hb-mono">
          {{ local.files.length }} TRACKS · {{ local.sizeText }}
          <template v-if="local.scannedAt"> · 已扫描</template>
        </div>
      </div>
      <div class="local__acts">
        <label class="local__toggle" :class="{ 'is-on': local.includeDownloads }">
          <input
            class="local__toggle-input"
            type="checkbox"
            :checked="local.includeDownloads"
            @change="local.setIncludeDownloads($event.target.checked)"
          />
          <span class="local__toggle-box"><Icon name="check" :size="10" /></span>
          <span class="local__toggle-text">包含下载目录</span>
        </label>
        <button class="hb-btn" :disabled="local.scanning" @click="local.scan()">
          <Icon name="refresh" :size="12" />
          {{ local.scanning ? '扫描中…' : '重新扫描' }}
        </button>
        <button class="hb-btn hb-btn--solid" @click="addFolders">
          <Icon name="plus" :size="12" />
          添加目录
        </button>
      </div>
    </header>

    <div v-if="local.folders.length" class="local__folders">
      <span class="hb-label local__folders-cap">SCAN FOLDERS</span>
      <span v-for="dir in local.folders" :key="dir" class="local__folder hb-clamp-1" :title="dir">
        <Icon name="folder" :size="12" />
        <span class="hb-clamp-1">{{ dir }}</span>
        <button class="local__folder-x" title="移除目录" @click="local.removeFolder(dir)"><Icon name="close" :size="11" /></button>
      </span>
    </div>
    <p v-else class="local__tip hb-mono">还没有添加本地目录。点「添加目录」选择存放音乐的文件夹，或勾选「包含下载目录」。</p>

    <p v-if="local.error" class="local__error hb-mono">{{ local.error }}</p>

    <!-- 下载目录里的音频 -->
    <div class="local__group">
      <div class="hb-section">
        <span class="hb-label">01</span>
        <h3 class="hb-section__title">下载歌曲</h3>
        <span class="hb-section__line" />
        <span class="hb-mono hb-muted">{{ downloaded.length }} · {{ groupSize(downloaded) }}</span>
        <button v-if="downloaded.length" class="hb-btn local__play" @click="local.playAll(downloaded)">
          <Icon name="play" :size="11" /> 播放全部
        </button>
      </div>
      <SongTable v-if="downloaded.length" :songs="downloaded" :show-album="false" :context="{ kind: 'local', name: '下载歌曲' }" />
      <p v-else class="local__empty">下载目录里还没有音频文件。用歌曲行的下载按钮或详情页「下载全部」试试。</p>
    </div>

    <!-- 用户添加的目录 -->
    <div class="local__group">
      <div class="hb-section">
        <span class="hb-label">02</span>
        <h3 class="hb-section__title">本地歌曲</h3>
        <span class="hb-section__line" />
        <span class="hb-mono hb-muted">{{ own.length }} · {{ groupSize(own) }}</span>
        <button v-if="own.length" class="hb-btn local__play" @click="local.playAll(own)">
          <Icon name="play" :size="11" /> 播放全部
        </button>
      </div>
      <SongTable v-if="own.length" :songs="own" :show-album="false" :context="{ kind: 'local', name: '本地歌曲' }" />
      <p v-else class="local__empty">添加目录后，里面的 mp3 / flac / wav / m4a 等音频会出现在这里，并可直接播放。</p>
    </div>
  </section>
</template>

<style scoped lang="scss">
.local {
  &__head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 20px;
    flex-wrap: wrap;
    margin-bottom: 18px;
  }

  &__title {
    font-size: 26px;
    margin-top: 5px;
  }

  &__sub {
    margin-top: 4px;
    font-size: 9px;
    color: var(--muted);
  }

  &__acts {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  &__toggle {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    color: var(--ink-soft);
    cursor: pointer;
    -webkit-app-region: no-drag;
  }

  &__toggle-input {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
    pointer-events: none;
  }

  &__toggle-box {
    width: 13px;
    height: 13px;
    flex: none;
    display: grid;
    place-items: center;
    border: 1px solid var(--line-strong);
    color: transparent;
    transition: background 0.16s, border-color 0.16s, color 0.16s;
  }

  .is-on &__toggle-box {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--on-accent);
  }

  &__toggle-text {
    letter-spacing: 0.04em;
  }

  &__folders {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    padding: 10px 12px;
    margin-bottom: 24px;
    border: 1px solid var(--line);
    background: var(--panel-bg);
  }

  &__folders-cap {
    font-size: 8px;
    margin-right: 4px;
  }

  &__folder {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: 320px;
    padding: 4px 6px 4px 8px;
    border: 1px solid var(--line);
    background: var(--surface);
    font-size: 10px;
    color: var(--ink-soft);

    > span {
      min-width: 0;
    }
  }

  &__folder-x {
    display: grid;
    place-items: center;
    flex: none;
    color: var(--faint);

    &:hover {
      color: var(--danger);
    }
  }

  &__tip,
  &__error {
    padding: 10px 14px;
    margin-bottom: 24px;
    border-left: 2px solid var(--line-strong);
    background: var(--panel-bg);
    font-size: 9px;
    line-height: 1.7;
    color: var(--muted);
  }

  &__error {
    color: var(--danger);
    border-left-color: var(--danger);
  }

  &__group {
    margin-bottom: 34px;
  }

  &__play {
    height: 26px;
    padding: 0 10px;
  }

  &__empty {
    padding: 30px 0;
    font-size: 12px;
    color: var(--muted);
    line-height: 1.8;
  }
}
</style>
