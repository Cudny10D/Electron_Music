<script setup>
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useHomeStore } from '../store/homeStore'
import { usePlayerStore } from '../store/playerStore'
import { useUserStore } from '../store/userStore'
import { playList } from '../utils/player'
import { dayOfMonth, formatTime, formatCount } from '../utils/format'
import { useUiStore } from '../store/uiStore'
import CoverCard from '../components/CoverCard.vue'
import Icon from '../components/Icon.vue'

const router = useRouter()
const home = useHomeStore()
const player = usePlayerStore()
const user = useUserStore()
const ui = useUiStore()

const day = computed(() => dayOfMonth())
const latest = computed(() => home.newSongs.slice(0, 5))

onMounted(() => {
  if (!home.recommended.length) home.loadHome()
})

function playLatest(index) {
  const song = home.newSongs[index]
  if (song?.playable === false) {
    ui.toast(song.reason || '该歌曲暂不可播放')
    return
  }
  playList(home.newSongs, index, { kind: 'newest', name: '最新歌曲' })
}

function openDaily() {
  if (!user.loggedIn) {
    router.push('/login')
    return
  }
  router.push('/daily')
}
</script>

<template>
  <div class="home hb-page">
    <!-- 顶部：每日推荐 + 最新歌曲 -->
    <section class="hero">
      <div class="daily hb-frame" @click="openDaily">
        <div class="daily__head">
          <span class="hb-label hb-label--inverse">DAILY</span>
          <span class="daily__head-note hb-mono">{{ user.loggedIn ? '为你生成' : '需要登录' }}</span>
        </div>
        <div class="daily__date hb-mono">{{ day }}</div>
        <div class="daily__foot">
          <span class="daily__title">每日推荐</span>
          <span class="daily__desc">每天 6:00 更新 · 根据口味挑选</span>
        </div>
        <span class="daily__go">
          <Icon name="arrow" :size="16" />
        </span>
      </div>

      <div class="latest">
        <div class="hb-section">
          <span class="hb-label">NEW</span>
          <h2 class="hb-section__title">最新歌曲</h2>
          <span class="hb-section__line" />
          <RouterLink class="hb-section__more hb-mono" to="/search?keywords=新歌">更多</RouterLink>
        </div>

        <div v-if="home.loading" class="latest__skeleton">
          <div v-for="i in 5" :key="i" class="skeleton-row" />
        </div>

        <div v-else class="latest__list">
          <button
            v-for="(song, index) in latest"
            :key="song.id"
            class="latest__row"
            :class="{ 'is-current': player.currentSong?.id === song.id }"
            @click="playLatest(index)"
          >
            <span class="latest__idx hb-mono">{{ String(index + 1).padStart(2, '0') }}</span>
            <span class="latest__main">
              <span class="latest__name hb-clamp-1">{{ song.name }}</span>
              <span class="latest__artist hb-clamp-1">
                {{ (song.ar || []).map((a) => a.name).join(' / ') }}
              </span>
            </span>
            <span class="latest__time hb-mono">{{ formatTime((song.dt || 0) / 1000) }}</span>
            <span class="latest__play"><Icon name="play" :size="11" /></span>
          </button>

          <p v-if="!latest.length" class="latest__empty">
            {{ home.error || '暂无数据' }}
          </p>
        </div>
      </div>
    </section>

    <!-- 推荐歌单 -->
    <section class="section">
      <div class="hb-section">
        <span class="hb-label">01</span>
        <h2 class="hb-section__title">推荐歌单</h2>
        <span class="hb-section__line" />
        <RouterLink class="hb-section__more hb-mono" to="/search?keywords=歌单">全部</RouterLink>
      </div>

      <div class="grid">
        <CoverCard
          v-for="(item, index) in home.recommended"
          :key="item.id"
          :index="index"
          :item="item"
          kind="playlist"
          :subtitle="`${item.trackCount || 0} 首 · ${formatCount(item.playCount)} 播放`"
        />
      </div>

      <div v-if="home.loading" class="grid">
        <div v-for="i in 6" :key="i" class="skeleton-card" />
      </div>

      <p v-if="home.error" class="error">{{ home.error }}</p>
    </section>
  </div>
</template>

<style scoped lang="scss">
.home {
}

.hero {
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr);
  gap: 40px;
  margin-bottom: 46px;
}

/* 每日推荐：橄榄实心卡 */
.daily {
  position: relative;
  height: 236px;
  background: var(--accent);
  color: var(--on-accent);
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  cursor: pointer;
  overflow: hidden;
  --frame-color: rgba(255, 255, 255, 0.45);

  &::before {
    content: '';
    position: absolute;
    right: -50px;
    top: -60px;
    width: 170px;
    height: 170px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 50%;
  }

  &.hb-frame::after {
    inset: 9px;
  }

  &__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  &__head-note {
    font-size: 8px;
    color: rgba(247, 246, 242, 0.7);
  }

  &__date {
    font-size: 84px;
    line-height: 0.9;
    letter-spacing: -0.02em;
    color: var(--paper);
    font-family: var(--font-mono), monospace;
  }

  &__foot {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  &__title {
    font-family: var(--font-display), sans-serif;
    font-weight: 700;
    font-size: 18px;
  }

  &__desc {
    font-size: 10px;
    color: rgba(247, 246, 242, 0.72);
  }

  &__go {
    position: absolute;
    right: 18px;
    bottom: 18px;
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border: 1px solid rgba(255, 255, 255, 0.35);
    transition: background 0.18s, color 0.18s;

    &:hover {
      background: var(--paper);
      color: var(--ink);
    }
  }
}

/* 最新歌曲 */
.latest {
  min-width: 0;

  &__row {
    width: 100%;
    display: grid;
    grid-template-columns: 30px minmax(0, 1fr) 46px 24px;
    align-items: center;
    gap: 10px;
    padding: 7px 8px;
    text-align: left;
    border-bottom: 1px solid var(--hover);
    transition: background 0.14s;

    &:hover {
      background: var(--hover-surface);
    }

    &.is-current {
      background: var(--surface);

      .latest__name {
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

  &__name {
    display: block;
    font-size: 13px;
    color: var(--ink);
  }

  &__artist {
    display: block;
    font-size: 10.5px;
    color: var(--muted);
  }

  &__time {
    font-size: 9px;
    color: var(--faint);
    text-align: right;
  }

  &__play {
    opacity: 0;
    color: var(--ink);
    transition: opacity 0.14s;
  }

  &__row:hover &__play {
    opacity: 1;
  }

  &__empty {
    padding: 30px 8px;
    color: var(--muted);
    font-size: 12px;
  }
}

.section {
  margin-bottom: 10px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(172px, 1fr));
  gap: 28px 22px;
}

.error {
  margin-top: 16px;
  font-size: 12px;
  color: var(--danger);
}

/* 骨架 */
.skeleton-row {
  height: 40px;
  margin-bottom: 8px;
  background: linear-gradient(90deg, rgba(255, 255, 255, 0.5), rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0.5));
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite linear;
}

.skeleton-card {
  aspect-ratio: 1 / 1;
  background: linear-gradient(90deg, rgba(255, 255, 255, 0.4), rgba(255, 255, 255, 0.8), rgba(255, 255, 255, 0.4));
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite linear;
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

@media (max-width: 1160px) {
  .hero {
    grid-template-columns: 260px minmax(0, 1fr);
    gap: 28px;
  }
}
</style>
