<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { formatCount } from '../utils/format'
import { copyShare } from '../utils/share'
import Icon from './Icon.vue'

const props = defineProps({
  item: { type: Object, required: true },
  kind: { type: String, default: 'playlist' },
  subtitle: { type: String, default: '' },
  index: { type: Number, default: null }
})

const router = useRouter()

const cover = computed(() => props.item.picUrl || props.item.coverImgUrl || props.item.img1v1Url || '')
const to = computed(() => {
  const id = props.item.id
  if (props.kind === 'album') return `/album/${id}`
  if (props.kind === 'artist') return `/artist/${id}`
  if (props.kind === 'playlist') return `/playlist/${id}`
  return '/'
})
const shareType = computed(() => (['playlist', 'album', 'artist'].includes(props.kind) ? props.kind : 'playlist'))

function onShare(event) {
  event?.stopPropagation?.()
  event?.preventDefault?.()
  copyShare(shareType.value, props.item)
}
</script>

<template>
  <RouterLink class="card hb-lift" :to="to">
    <div class="card__cover hb-frame">
      <img v-if="cover" :src="`${cover}?param=400y400`" loading="lazy" alt="" />
      <div v-else class="card__placeholder">
        <Icon name="music" :size="26" />
      </div>

      <span v-if="kind === 'playlist' && item.playCount" class="card__count hb-mono">
        <Icon name="play" :size="9" />
        {{ formatCount(item.playCount) }}
      </span>

      <button class="card__share" title="分享（复制链接）" @click="onShare">
        <Icon name="share" :size="13" />
      </button>

      <span class="card__go">
        <Icon name="play" :size="15" />
      </span>
    </div>

    <div class="card__meta">
      <span v-if="index !== null" class="card__idx hb-mono">{{ String(index + 1).padStart(2, '0') }}</span>
      <div class="card__name hb-clamp-2">{{ item.name }}</div>
    </div>
    <div v-if="subtitle" class="card__sub hb-clamp-1">{{ subtitle }}</div>
  </RouterLink>
</template>

<style scoped lang="scss">
.card {
  display: block;
  min-width: 0;

  &__cover {
    position: relative;
    aspect-ratio: 1 / 1;
    background: var(--paper-deep);
    overflow: hidden;
    border: 1px solid var(--line);

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transition: transform 0.5s var(--ease), filter 0.3s;
    }

    &::before {
      content: '';
      position: absolute;
      inset: 0;
      background: rgba(13, 20, 23, 0);
      transition: background 0.24s;
      z-index: 1;
    }
  }

  &:hover &__cover img {
    transform: scale(1.04);
  }

  &:hover &__cover::before {
    background: rgba(13, 20, 23, 0.18);
  }

  &__placeholder {
    width: 100%;
    height: 100%;
    display: grid;
    place-items: center;
    color: var(--faint);
  }

  &__count {
    position: absolute;
    top: 8px;
    left: 8px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 6px;
    background: rgba(13, 20, 23, 0.72);
    color: #fff;
    font-size: 9px;
    z-index: 2;
    backdrop-filter: blur(4px);
  }

  &__share {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 26px;
    height: 26px;
    display: grid;
    place-items: center;
    border: 1px solid rgba(255, 255, 255, 0.3);
    background: rgba(13, 20, 23, 0.62);
    color: #fff;
    opacity: 0;
    transform: translateY(-4px);
    transition: opacity 0.18s, transform 0.18s, background 0.18s;
    z-index: 3;
    backdrop-filter: blur(4px);
    -webkit-app-region: no-drag;

    &:hover {
      background: rgba(13, 20, 23, 0.9);
    }
  }

  &:hover &__share {
    opacity: 1;
    transform: translateY(0);
  }

  &__go {
    position: absolute;
    right: 8px;
    bottom: 8px;
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    background: var(--ink);
    color: var(--paper);
    opacity: 0;
    transform: translateY(6px);
    transition: opacity 0.2s var(--ease), transform 0.2s var(--ease);
    z-index: 2;
  }

  &:hover &__go {
    opacity: 1;
    transform: translateY(0);
  }

  &__meta {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-top: 9px;
  }

  &__idx {
    font-size: 8px;
    color: var(--faint);
    flex: none;
  }

  &__name {
    font-size: 12.5px;
    line-height: 1.45;
    color: var(--ink);
  }

  &__sub {
    margin-top: 3px;
    font-size: 10.5px;
    color: var(--muted);
  }
}
</style>
