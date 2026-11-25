<script setup>
import { useUiStore } from '../store/uiStore'

const ui = useUiStore()
</script>

<template>
  <div class="toasts">
    <TransitionGroup name="toast">
      <div v-for="item in ui.toasts" :key="item.id" class="toast" :class="`toast--${item.type}`">
        <span class="toast__mark" />
        <span>{{ item.text }}</span>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped lang="scss">
.toasts {
  position: fixed;
  right: var(--gutter);
  bottom: calc(var(--player) + 20px);
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 90;
  pointer-events: none;
}

.toast {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 14px 9px 12px;
  background: var(--toast-bg);
  color: var(--toast-fg);
  border: 1px solid var(--toast-edge);
  font-size: 12px;
  letter-spacing: 0.02em;
  box-shadow: var(--shadow);

  &__mark {
    width: 7px;
    height: 7px;
    background: var(--toast-fg);
    flex: none;
  }

  &--error .toast__mark {
    background: #ff8a65;
  }
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.2s var(--ease), transform 0.24s var(--ease);
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
