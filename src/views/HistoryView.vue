<script setup>
import { computed } from 'vue'
import { useHistoryStore } from '../store/historyStore'
import { useUiStore } from '../store/uiStore'
import { playList } from '../utils/player'
import SongTable from '../components/SongTable.vue'
import Icon from '../components/Icon.vue'

const history = useHistoryStore()
const ui = useUiStore()

const items = computed(() =>
  history.items.map((item) => ({
    ...item,
    ar: item.ar || [],
    al: item.al || {}
  }))
)

function clearAll() {
  history.clear()
  ui.toast('播放历史已清空')
}
</script>

<template>
  <div class="history hb-page">
    <header class="history__head">
      <div>
        <span class="hb-label">HISTORY / 播放历史</span>
        <h1 class="history__title hb-display">最近播放</h1>
        <div class="history__sub hb-mono">{{ items.length }} TRACKS · 只保留最近 300 首</div>
      </div>

      <button class="hb-btn" :disabled="!items.length" @click="clearAll">
        <Icon name="refresh" :size="12" />
        清空
      </button>
    </header>

    <SongTable v-if="items.length" :songs="items" :context="{ kind: 'history', name: '播放历史' }" />
    <p v-else class="empty">还没有播放记录，去首页点一首歌。</p>
  </div>
</template>

<style scoped lang="scss">
.history {

  &__head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 24px;
    margin-bottom: 22px;
  }

  &__title {
    margin-top: 6px;
    font-size: 34px;
    line-height: 1.1;
  }

  &__sub {
    margin-top: 4px;
    color: var(--muted);
    font-size: 9px;
  }
}

.empty {
  padding: 60px 0;
  text-align: center;
  color: var(--muted);
  font-size: 12px;
}
</style>
