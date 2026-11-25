<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'

const props = defineProps({
  progress: { type: Number, default: 0 },
  duration: { type: Number, default: 0 },
  thin: { type: Boolean, default: false },
  live: { type: Boolean, default: false }
})

const emit = defineEmits(['seek'])

const barRef = ref(null)
const dragging = ref(false)
const preview = ref(0)

const ratio = computed(() => {
  const total = props.duration || 0
  const current = dragging.value ? preview.value : props.progress
  if (!total) return 0
  return Math.min(100, Math.max(0, (current / total) * 100))
})

function timeFromEvent(event) {
  const rect = barRef.value.getBoundingClientRect()
  const x = Math.min(Math.max(event.clientX - rect.left, 0), rect.width)
  return (x / rect.width) * (props.duration || 0)
}

let lastEmit = 0

function onMove(event) {
  if (!dragging.value) return
  preview.value = timeFromEvent(event)
  // 拖动中实时跳转（设置里可关），节流 120ms
  if (props.live) {
    const now = Date.now()
    if (now - lastEmit > 120) {
      lastEmit = now
      emit('seek', preview.value)
    }
  }
}

function onUp() {
  if (!dragging.value) return
  dragging.value = false
  emit('seek', preview.value)
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', onUp)
}

function onDown(event) {
  if (!props.duration) return
  dragging.value = true
  preview.value = timeFromEvent(event)
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}

onBeforeUnmount(onUp)
</script>

<template>
  <div
    ref="barRef"
    class="bar"
    :class="{ 'bar--thin': thin, 'is-dragging': dragging }"
    @pointerdown="onDown"
  >
    <div class="bar__track" />
    <div class="bar__fill" :style="{ width: `${ratio}%` }" />
    <span class="bar__knob" :style="{ left: `${ratio}%` }" />
  </div>
</template>

<style scoped lang="scss">
.bar {
  position: relative;
  height: 14px;
  display: flex;
  align-items: center;
  cursor: pointer;

  &__track {
    width: 100%;
    height: 3px;
    background: var(--track);
  }

  &__fill {
    position: absolute;
    left: 0;
    height: 3px;
    background: var(--ink);
    transition: width 0.08s linear;
  }

  &__knob {
    position: absolute;
    width: 9px;
    height: 9px;
    background: var(--ink);
    transform: translate(-50%, 0) scale(0);
    transition: transform 0.16s var(--ease);
  }

  &:hover &__knob,
  &.is-dragging &__knob {
    transform: translate(-50%, 0) scale(1);
  }

  &.is-dragging &__fill {
    transition: none;
  }

  &--thin {
    height: 4px;
  }

  &--thin &__track,
  &--thin &__fill {
    height: 2px;
  }
}
</style>
