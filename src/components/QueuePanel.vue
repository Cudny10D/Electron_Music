<script setup>
import { computed } from 'vue'
import { usePlayerStore } from '../store/playerStore'
import { useUiStore } from '../store/uiStore'
import { playAt } from '../utils/player'
import { formatTime } from '../utils/format'
import Icon from './Icon.vue'

const player = usePlayerStore()
const ui = useUiStore()

const listInfo = computed(() => player.listInfo)
const title = computed(() => {
  const kindName = { playlist: '歌单', album: '专辑', artist: '歌手', likes: '我喜欢的音乐', daily: '每日推荐', search: '搜索结果' }
  return listInfo.value?.name || kindName[listInfo.value?.kind] || '播放队列'
})
</script>

<template>
  <aside class="queue hb-acrylic">
    <header class="queue__head">
      <div class="queue__title">
        <span class="hb-label">QUEUE</span>
        <span class="queue__name hb-clamp-1">{{ title }}</span>
      </div>
      <div class="queue__head-right">
        <span class="hb-mono hb-muted">{{ player.songList.length }} 首</span>
        <button class="hb-icon-btn" title="关闭" @click="ui.toggleQueue(false)">
          <Icon name="close" :size="16" />
        </button>
      </div>
    </header>

    <div class="queue__list hb-scroll">
      <button
        v-for="(song, index) in player.songList"
        :key="`${song.id}-${index}`"
        class="queue__item"
        :class="{ 'is-current': index === player.currentIndex }"
        @click="playAt(index)"
      >
        <span class="queue__idx hb-mono">{{ String(index + 1).padStart(2, '0') }}</span>
        <span class="queue__main">
          <span class="queue__song hb-clamp-1">{{ song.name }}</span>
          <span class="queue__artist hb-clamp-1">
            {{ (song.ar || []).map((a) => a.name).join(' / ') }}
          </span>
        </span>
        <span class="queue__time hb-mono">{{ formatTime((song.dt || 0) / 1000) }}</span>
      </button>

      <p v-if="!player.songList.length" class="queue__empty">队列是空的</p>
    </div>
  </aside>
</template>

<style scoped lang="scss">
.queue {
  position: fixed;
  top: var(--titlebar);
  right: 0;
  bottom: var(--player);
  width: 380px;
  background: var(--panel-bg);
  border-left: 1px solid var(--line-strong);
  box-shadow: -24px 0 60px rgba(30, 26, 16, 0.1);
  z-index: 60;
  display: flex;
  flex-direction: column;

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

  &__list {
    flex: 1;
    min-height: 0;
    padding: 8px 0 20px;
  }

  &__item {
    width: 100%;
    display: grid;
    grid-template-columns: 26px minmax(0, 1fr) 40px;
    align-items: center;
    gap: 8px;
    padding: 8px 18px;
    text-align: left;
    border-left: 2px solid transparent;
    transition: background 0.14s;

    &:hover {
      background: var(--hover);
    }

    &.is-current {
      background: var(--surface);
      border-left-color: var(--ink);

      .queue__song {
        color: var(--ink);
      }
    }
  }

  &__idx {
    font-size: 9px;
    color: var(--faint);
  }

  &__main {
    min-width: 0;
    display: block;
  }

  &__song {
    display: block;
    font-size: 12px;
    color: var(--ink-soft);
  }

  &__artist {
    display: block;
    font-size: 10px;
    color: var(--muted);
    margin-top: 1px;
  }

  &__time {
    font-size: 9px;
    color: var(--faint);
    text-align: right;
  }

  &__empty {
    padding: 40px 18px;
    text-align: center;
    color: var(--faint);
    font-size: 12px;
  }
}
</style>
