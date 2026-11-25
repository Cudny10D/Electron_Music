<script setup>
import { computed } from 'vue'
import { copyShare, shareLink, SHARE_TYPES } from '../utils/share'
import Icon from './Icon.vue'

const props = defineProps({
  type: { type: String, required: true }, // playlist | album | artist | song
  item: { type: Object, required: true },
  compact: { type: Boolean, default: false },
  label: { type: String, default: '' }
})
const emit = defineEmits(['done'])

const link = computed(() => shareLink(props.type, props.item?.id))
const text = computed(() => props.label || `分享${SHARE_TYPES[props.type]?.label || ''}`)

async function onClick(event) {
  event?.stopPropagation?.()
  const ok = await copyShare(props.type, props.item)
  emit('done', ok)
}
</script>

<template>
  <button
    :class="compact ? 'hb-icon-btn share-btn' : 'hb-btn share-btn'"
    :title="`${text}：${link}`"
    @click="onClick"
  >
    <Icon name="share" :size="compact ? 14 : 12" />
    <span v-if="!compact">{{ text }}</span>
  </button>
</template>

<style scoped lang="scss">
.share-btn {
  flex: none;
}
</style>
