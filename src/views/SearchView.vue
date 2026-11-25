<script setup>
import { computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useSearchStore } from '../store/searchStore'
import { playList } from '../utils/player'
import SongTable from '../components/SongTable.vue'
import CoverCard from '../components/CoverCard.vue'
import Icon from '../components/Icon.vue'

const route = useRoute()
const search = useSearchStore()

const tabs = computed(() => [
  { key: 'songs', label: '单曲', count: search.songs.length },
  { key: 'playlists', label: '歌单', count: search.playlists.length },
  { key: 'artists', label: '歌手', count: search.artists.length },
  { key: 'albums', label: '专辑', count: search.albums.length }
])

const total = computed(
  () => search.songs.length + search.playlists.length + search.artists.length + search.albums.length
)

function run() {
  const keywords = route.query.keywords
  if (keywords) search.searchAll(keywords)
}

function playSong(index) {
  playList(search.songs, index, { kind: 'search', name: search.keyword })
}

onMounted(run)
watch(() => route.query.keywords, run)
</script>

<template>
  <div class="search hb-page">
    <header class="search__head">
      <span class="hb-label">SEARCH</span>
      <h1 class="search__title hb-display">
        {{ search.keyword ? `“${search.keyword}”` : '搜索' }}
      </h1>
      <div class="search__meta">
        <span class="hb-mono hb-muted">共 {{ total }} 条结果</span>
      </div>
    </header>

    <nav class="tabs">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="tabs__item"
        :class="{ 'is-active': search.tab === tab.key }"
        @click="search.tab = tab.key"
      >
        <span>{{ tab.label }}</span>
        <span class="tabs__count hb-mono">{{ tab.count }}</span>
      </button>
    </nav>

    <div v-if="search.loading" class="loading">
      <span class="hb-mono">SEARCHING…</span>
    </div>

    <template v-else>
      <section v-if="search.tab === 'songs'" class="pane">
        <SongTable v-if="search.songs.length" :songs="search.songs" :context="{ kind: 'search', name: search.keyword }" />
        <p v-else class="empty">没有找到单曲</p>
      </section>

      <section v-else-if="search.tab === 'playlists'" class="grid">
        <CoverCard v-for="(item, index) in search.playlists" :key="item.id" :index="index" :item="item" kind="playlist" :subtitle="`by ${item.creator?.nickname || '网易云'}`" />
        <p v-if="!search.playlists.length" class="empty">没有找到歌单</p>
      </section>

      <section v-else-if="search.tab === 'albums'" class="grid">
        <CoverCard v-for="(item, index) in search.albums" :key="item.id" :index="index" :item="item" kind="album" :subtitle="item.artist?.name" />
        <p v-if="!search.albums.length" class="empty">没有找到专辑</p>
      </section>

      <section v-else class="artists">
        <RouterLink v-for="item in search.artists" :key="item.id" class="artist" :to="`/artist/${item.id}`">
          <div class="artist__avatar hb-frame">
            <img v-if="item.picUrl" :src="`${item.picUrl}?param=200y200`" loading="lazy" alt="" />
            <div v-else class="artist__empty"><Icon name="user" :size="26" /></div>
          </div>
          <div class="artist__name hb-clamp-1">{{ item.name }}</div>
          <div class="artist__alias hb-clamp-1">{{ (item.alias || []).join(' / ') || '歌手' }}</div>
        </RouterLink>
        <p v-if="!search.artists.length" class="empty">没有找到歌手</p>
      </section>

      <p v-if="search.error && !total" class="empty">{{ search.error }}</p>
    </template>
  </div>
</template>

<style scoped lang="scss">
.search {
}

.search__head {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 22px;
}

.search__title {
  font-size: 30px;
  line-height: 1.1;
  max-width: 60vw;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.search__meta {
  margin-left: auto;
}

.tabs {
  display: flex;
  gap: 26px;
  border-bottom: 1px solid var(--line);
  margin-bottom: 22px;

  &__item {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 0 1px 10px;
    font-size: 13px;
    color: var(--muted);
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    transition: color 0.16s, border-color 0.16s;

    &:hover {
      color: var(--ink-soft);
    }

    &.is-active {
      color: var(--ink);
      border-bottom-color: var(--ink);
    }
  }

  &__count {
    font-size: 9px;
    color: var(--faint);
  }
}

.pane {
  min-height: 200px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(172px, 1fr));
  gap: 28px 22px;
}

.artists {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 30px 22px;
}

.artist {
  display: block;
  text-align: center;

  &__avatar {
    width: 108px;
    height: 108px;
    margin: 0 auto 12px;
    border-radius: 50%;
    overflow: hidden;
    background: var(--paper-deep);
    border: 1px solid var(--line);

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transition: transform 0.4s var(--ease);
    }
  }

  &:hover &__avatar img {
    transform: scale(1.05);
  }

  &__empty {
    width: 100%;
    height: 100%;
    display: grid;
    place-items: center;
    color: var(--faint);
  }

  &__name {
    font-size: 13px;
  }

  &__alias {
    font-size: 10px;
    color: var(--muted);
    margin-top: 2px;
  }
}

.loading {
  padding: 60px 0;
  color: var(--muted);
  text-align: center;
}

.empty {
  padding: 46px 0;
  color: var(--muted);
  font-size: 12px;
  text-align: center;
}

/* 让 hb-frame 的角标在圆形头像上收一点 */
.artist__avatar.hb-frame::after {
  inset: -5px;
}
</style>
