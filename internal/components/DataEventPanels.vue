<script setup lang="ts">
import { useElementSize } from '@vueuse/core'
import { useDataViews } from '../../composables/dataViews'

const minDataHeight = 100
const minEventsHeight = 200
const dividerHeight = 8
const views = useDataViews()
const hasData = computed(() => Object.keys(views).length > 0)
const container = useTemplateRef('container')
const { height } = useElementSize(container)
const dataPanelId = useId()
const share = ref<number | null>(null)
const drag = ref<{ pointerId: number; startY: number; startHeight: number } | null>(null)

const availableHeight = computed(() => Math.max(minDataHeight + minEventsHeight, height.value - dividerHeight))
const maxDataHeight = computed(() => availableHeight.value - minEventsHeight)
const clampHeight = (value: number) => Math.max(minDataHeight, Math.min(value, maxDataHeight.value))
const dataHeight = computed(() => clampHeight(share.value === null ? 500 : availableHeight.value * share.value))
const resize = (value: number) => { share.value = clampHeight(value) / availableHeight.value }
const percentage = (value: number) => Math.round(value / availableHeight.value * 100)

const startDrag = (event: PointerEvent) => {
  if (event.button !== 0 || drag.value) return
  const divider = event.currentTarget as HTMLElement
  divider.setPointerCapture(event.pointerId)
  divider.focus()
  event.preventDefault()
  drag.value = { pointerId: event.pointerId, startY: event.clientY, startHeight: dataHeight.value }
}

const moveDrag = (event: PointerEvent) => {
  if (drag.value?.pointerId !== event.pointerId) return
  resize(drag.value.startHeight + event.clientY - drag.value.startY)
}

const endDrag = (event: PointerEvent) => {
  if (drag.value?.pointerId === event.pointerId) drag.value = null
}

const handleKey = (event: KeyboardEvent) => {
  if (event.key === 'ArrowUp') resize(dataHeight.value - 10)
  else if (event.key === 'ArrowDown') resize(dataHeight.value + 10)
  else if (event.key === 'Home') resize(minDataHeight)
  else if (event.key === 'End') resize(maxDataHeight.value)
  else return
  event.preventDefault()
}
</script>

<template>
  <div
    ref="container"
    class="flex flex-col"
    :style="{ minHeight: `${minEventsHeight + (hasData ? minDataHeight + dividerHeight : 0)}px` }"
  >
    <DataView v-if="hasData" :id="dataPanelId" class="shrink-0 min-h-0" :style="{ height: `${dataHeight}px` }" />
    <div
      v-if="hasData"
      class="panel-divider shrink-0"
      :class="{ dragging: drag }"
      :style="{ height: `${dividerHeight}px` }"
      role="separator"
      tabindex="0"
      aria-label="Resize Data and Events panels"
      aria-orientation="horizontal"
      :aria-controls="dataPanelId"
      :aria-valuemin="percentage(minDataHeight)"
      :aria-valuemax="percentage(maxDataHeight)"
      :aria-valuenow="percentage(dataHeight)"
      @pointerdown="startDrag"
      @pointermove="moveDrag"
      @pointerup="endDrag"
      @pointercancel="endDrag"
      @lostpointercapture="endDrag"
      @keydown="handleKey"
    />
    <EventView class="flex-1 min-h-0" :style="{ minHeight: `${minEventsHeight}px` }" />
  </div>
</template>

<style scoped>
.panel-divider {
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: row-resize;
  touch-action: none;
  user-select: none;
}

.panel-divider::before {
  content: '';
  width: 48px;
  height: 2px;
  border-radius: 2px;
  background: #d1d5db;
}

.panel-divider:hover::before,
.panel-divider:focus-visible::before,
.panel-divider.dragging::before {
  background: #6b7280;
}

.panel-divider:focus-visible {
  outline: 2px solid #6b7280;
  outline-offset: 1px;
}
</style>
