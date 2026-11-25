<script setup>
import { computed } from 'vue'
import { useDownloadStore } from '../store/downloadStore'
import { useUiStore } from '../store/uiStore'
import { useSettingsStore } from '../store/settingsStore'
import { formatBytes } from '../utils/format'
import Icon from './Icon.vue'

defineProps({
  /** 内嵌进「我的音乐」页时去掉 fixed 抽屉定位，变成普通面板 */
  embedded: { type: Boolean, default: false }
})

const downloads = useDownloadStore()
const ui = useUiStore()
const settings = useSettingsStore()

const STATUS = {
  queued: '等待中',
  fetching: '获取地址',
  downloading: '下载中',
  done: '已完成',
  error: '失败',
  canceled: '已取消'
}

const concurrencyOptions = [1, 2, 3, 4, 5]

const summary = computed(() => {
  const t = downloads.tasks
  return {
    total: t.length,
    done: downloads.doneCount,
    failed: downloads.failedCount,
    pending: downloads.pendingCount
  }
})

function statusText(task) {
  if (task.status === 'error') return task.error || '下载失败'
  if (task.status === 'downloading') {
    const size = task.total ? ` · ${formatBytes(task.loaded)} / ${formatBytes(task.total)}` : ` · ${formatBytes(task.loaded)}`
    return `${task.progress}%${size}`
  }
  if (task.status === 'done') return task.size ? formatBytes(task.size) : '已完成'
  return STATUS[task.status] || ''
}

function setConcurrency(n) {
  settings.update({ downloadConcurrency: n })
}
</script>

<template>
  <aside class="dl hb-acrylic" :class="{ 'dl--embedded': embedded }">
    <header class="dl__head">
      <div class="dl__title">
        <span class="hb-label">DOWNLOADS</span>
        <span class="dl__name hb-clamp-1">下载队列</span>
      </div>
      <div class="dl__head-right">
        <span class="hb-mono hb-muted">{{ summary.done }}/{{ summary.total }}</span>
        <button v-if="!embedded" class="hb-icon-btn" title="关闭" @click="ui.toggleDownloads(false)">
          <Icon name="close" :size="16" />
        </button>
      </div>
    </header>

    <!-- 汇总进度 -->
    <div class="dl__overview">
      <div class="dl__overview-top">
        <span class="hb-mono dl__ov-label">
          <template v-if="downloads.hasActive">正在下载 {{ summary.pending }} 首</template>
          <template v-else-if="summary.total">{{ summary.done }} 首完成<span v-if="summary.failed"> · {{ summary.failed }} 首失败</span></template>
          <template v-else>队列是空的</template>
        </span>
        <span class="hb-mono dl__ov-pct">{{ downloads.overallPercent }}%</span>
      </div>
      <div class="dl__ov-track">
        <div class="dl__ov-fill" :style="{ width: `${downloads.overallPercent}%` }" />
      </div>
    </div>

    <!-- 工具条 -->
    <div class="dl__tools">
      <div class="dl__conc">
        <span class="hb-mono">并发</span>
        <button
          v-for="n in concurrencyOptions"
          :key="n"
          class="dl__conc-btn hb-mono"
          :class="{ 'is-active': settings.downloadConcurrency === n }"
          @click="setConcurrency(n)"
        >
          {{ n }}
        </button>
      </div>
      <div class="dl__tools-right">
        <button class="hb-icon-btn" title="打开下载目录" @click="downloads.openFolder()">
          <Icon name="folder" :size="15" />
        </button>
        <button class="hb-icon-btn" title="重试全部失败" :disabled="!summary.failed" @click="downloads.retryFailed()">
          <Icon name="refresh" :size="15" />
        </button>
        <button class="hb-icon-btn" title="清除已完成" :disabled="!downloads.doneCount" @click="downloads.clearFinished()">
          <Icon name="trash" :size="15" />
        </button>
      </div>
    </div>

    <!-- 任务列表 -->
    <div class="dl__list hb-scroll">
      <div v-for="task in downloads.tasks" :key="task.id" class="dl__task" :class="`is-${task.status}`">
        <div class="dl__task-top">
          <span class="dl__task-status" :class="`is-${task.status}`">
            <Icon v-if="task.status === 'done'" name="check" :size="12" />
            <Icon v-else-if="task.status === 'downloading' || task.status === 'fetching'" name="download" :size="12" />
            <Icon v-else-if="task.status === 'error'" name="close" :size="12" />
            <span v-else class="dl__dot" />
          </span>
          <div class="dl__task-main">
            <div class="dl__song hb-clamp-1">{{ task.name }}</div>
            <div class="dl__artist hb-clamp-1">{{ task.artist || '—' }}</div>
          </div>
          <div class="dl__task-acts">
            <button
              v-if="['queued', 'fetching', 'downloading'].includes(task.status)"
              class="hb-icon-btn dl__act"
              title="取消"
              @click="downloads.cancel(task.id)"
            >
              <Icon name="stop" :size="13" />
            </button>
            <button
              v-if="['error', 'canceled', 'done'].includes(task.status)"
              class="hb-icon-btn dl__act"
              :title="task.status === 'done' ? '定位文件' : '重试'"
              @click="task.status === 'done' ? downloads.reveal(task) : downloads.retry(task.id)"
            >
              <Icon :name="task.status === 'done' ? 'folder' : 'refresh'" :size="13" />
            </button>
            <button class="hb-icon-btn dl__act" title="移除" @click="downloads.remove(task.id)">
              <Icon name="close" :size="13" />
            </button>
          </div>
        </div>

        <div class="dl__task-bottom">
          <span class="dl__task-text hb-mono hb-clamp-1" :class="{ 'is-error': task.status === 'error' }">
            {{ statusText(task) }}
          </span>
          <span v-if="task.status === 'downloading'" class="hb-mono dl__task-pct">{{ task.progress }}%</span>
        </div>
        <div v-if="['downloading', 'done'].includes(task.status)" class="dl__task-track">
          <div class="dl__task-fill" :style="{ width: `${task.progress}%` }" />
        </div>
      </div>

      <div v-if="!downloads.tasks.length" class="dl__empty">
        <Icon name="download" :size="30" />
        <p>还没有下载任务</p>
        <span>在歌曲列表点下载，或用详情页的「下载全部」</span>
      </div>
    </div>
  </aside>
</template>

<style scoped lang="scss">
.dl {
  position: fixed;
  top: var(--titlebar);
  right: 0;
  bottom: var(--player);
  width: 400px;
  background: var(--panel-bg);
  border-left: 1px solid var(--line-strong);
  box-shadow: -24px 0 60px rgba(30, 26, 16, 0.1);
  z-index: 60;
  display: flex;
  flex-direction: column;

  // 内嵌到「我的音乐」页：不浮在右侧，作为普通面板参与文档流
  &--embedded {
    position: static;
    width: auto;
    height: 480px;
    max-height: 58vh;
    border: 1px solid var(--line);
    box-shadow: none;
    background: var(--panel-bg);
  }

  &__head {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 16px 18px 14px;
    border-bottom: 1px solid var(--line);
  }

  &__title {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  &__name {
    font-size: 12px;
    color: var(--ink-soft);
  }

  &__head-right {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: none;
  }

  &__overview {
    flex: none;
    padding: 14px 18px 12px;
    border-bottom: 1px solid var(--line-soft);
  }

  &__overview-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  &__ov-label {
    font-size: 10px;
    color: var(--ink-soft);
  }

  &__ov-pct {
    font-size: 11px;
    color: var(--ink);
  }

  &__ov-track,
  &__task-track {
    height: 3px;
    background: var(--track);
    overflow: hidden;
  }

  &__ov-fill,
  &__task-fill {
    height: 100%;
    background: var(--accent);
    transition: width 0.25s ease;
  }

  &__tools {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 9px 16px;
    border-bottom: 1px solid var(--line);
  }

  &__conc {
    display: flex;
    align-items: center;
    gap: 3px;

    > .hb-mono {
      font-size: 9px;
      color: var(--muted);
      margin-right: 4px;
    }
  }

  &__conc-btn {
    width: 22px;
    height: 20px;
    border: 1px solid var(--line);
    color: var(--ink-soft);
    font-size: 9px;
    transition: background 0.14s, color 0.14s;

    &:hover {
      background: var(--hover);
    }

    &.is-active {
      background: var(--ink);
      border-color: var(--ink);
      color: var(--paper);
    }
  }

  &__tools-right {
    display: flex;
    align-items: center;
    gap: 2px;

    .hb-icon-btn:disabled {
      opacity: 0.32;
      cursor: default;
    }
  }

  &__list {
    flex: 1;
    min-height: 0;
    padding: 6px 0 20px;
  }

  &__task {
    padding: 10px 18px 11px;
    border-bottom: 1px solid var(--line-soft);
    border-left: 2px solid transparent;

    &.is-downloading,
    &.is-fetching {
      border-left-color: var(--accent);
    }

    &.is-error {
      border-left-color: var(--danger);
    }
  }

  &__task-top {
    display: grid;
    grid-template-columns: 16px minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
  }

  &__task-status {
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

  &__task-main {
    min-width: 0;
  }

  &__song {
    font-size: 12px;
    color: var(--ink);
  }

  &__artist {
    font-size: 10px;
    color: var(--muted);
    margin-top: 1px;
    font-weight: 400;
  }

  &__task-acts {
    display: flex;
    gap: 1px;
    opacity: 0;
    transition: opacity 0.14s;
  }

  &__task:hover &__task-acts {
    opacity: 1;
  }

  &__act {
    width: 24px;
    height: 24px;
  }

  &__task-bottom {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin: 6px 0 0 24px;
  }

  &__task-text {
    font-size: 9px;
    color: var(--muted);
    min-width: 0;

    &.is-error {
      color: var(--danger);
    }
  }

  &__task-pct {
    font-size: 9px;
    color: var(--ink-soft);
    flex: none;
  }

  &__task-track {
    margin: 6px 0 0 24px;
    height: 2px;
  }

  &__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 56px 24px;
    color: var(--faint);
    text-align: center;

    p {
      font-size: 12px;
      color: var(--muted);
      margin: 6px 0 0;
    }

    span {
      font-size: 10px;
      color: var(--faint);
      line-height: 1.6;
    }
  }
}
</style>
