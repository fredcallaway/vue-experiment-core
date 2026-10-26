<script setup lang="ts">
import { onClickOutside } from '@vueuse/core'

const dock = useTemplateRef('dock')
const trigger = useTemplateRef('trigger')
const open = ref(false)
const pinned = ref(false)

const close = () => {
  open.value = false
  pinned.value = false
}

const toggle = () => {
  pinned.value = !pinned.value
  open.value = pinned.value
}

const handleFocusOut = (event: FocusEvent) => {
  if (!dock.value?.contains(event.relatedTarget as Node | null)) close()
}

const handleEscape = () => {
  close()
  trigger.value?.focus()
}

onClickOutside(dock, close)
</script>

<template>
  <div
    ref="dock"
    class="preview-outline"
    @pointerenter="event => { if (event.pointerType === 'mouse') open = true }"
    @pointerleave="() => { if (!pinned) open = false }"
    @focusout="handleFocusOut"
    @keydown.esc.stop.prevent="handleEscape"
  >
    <button
      ref="trigger"
      type="button"
      class="outline-trigger"
      :class="{ 'is-open': open }"
      :aria-expanded="open"
      aria-controls="preview-outline-panel"
      @click="toggle"
    >
      <span class="i-mdi-file-tree-outline text-base" aria-hidden="true" />
      Outline
    </button>
    <Transition name="outline">
      <section v-if="open" id="preview-outline-panel" class="outline-panel" aria-label="Experiment outline">
        <EpochControls class="shrink-0" />
        <EpochOutline class="flex-1 min-h-0" />
      </section>
    </Transition>
  </div>
</template>

<style scoped>
.preview-outline {
  position: fixed;
  top: 44px;
  right: 16px;
  z-index: 50;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.outline-trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 10px;
  border: 1px solid rgb(255 255 255 / 15%);
  border-radius: 6px;
  color: white;
  font-size: 12px;
  opacity: 0.5;
  transition: opacity 150ms, background-color 150ms;
}

.outline-trigger:hover,
.outline-trigger:focus-visible,
.outline-trigger.is-open {
  background: rgb(255 255 255 / 8%);
  opacity: 1;
}

.outline-trigger:focus-visible {
  outline: 1px solid white;
  outline-offset: 3px;
}

.outline-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: min(320px, calc(100vw - 32px));
  height: min(560px, calc(100vh - 100px));
  margin-top: 8px;
  padding: 8px;
  border: 1px solid rgb(0 0 0 / 12%);
  border-radius: 12px;
  background: white;
  box-shadow: 0 12px 40px rgb(0 0 0 / 18%);
}

.outline-enter-active,
.outline-leave-active {
  transition: opacity 120ms, transform 120ms;
}

.outline-enter-from,
.outline-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@media (prefers-reduced-motion: reduce) {
  .outline-trigger,
  .outline-enter-active,
  .outline-leave-active {
    transition: none;
  }
}
</style>
