<script lang="ts" setup>
import { onClickOutside, useEventListener, useResizeObserver } from '@vueuse/core'

const props = defineProps<{ value: string; column: string }>()
const preview = useTemplateRef('preview')
const button = useTemplateRef('button')
const popover = useTemplateRef('popover')
const popoverId = useId()
const hasOverflow = ref(false)
const isOpen = ref(false)
const position = ref({ left: 0, top: 0 })

const measureOverflow = () => {
  const el = preview.value
  if (!el) return
  hasOverflow.value = el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1
  if (!hasOverflow.value) isOpen.value = false
}

const updatePosition = () => {
  if (!isOpen.value || !button.value) return
  const bounds = button.value.getBoundingClientRect()
  position.value = { left: bounds.right, top: bounds.bottom + 4 }
}

const toggle = () => {
  isOpen.value = !isOpen.value
  updatePosition()
}

useResizeObserver(preview, () => {
  measureOverflow()
  updatePosition()
})
watch(() => props.value, () => {
  isOpen.value = false
  measureOverflow()
}, { flush: 'post' })

onClickOutside(popover, () => { isOpen.value = false }, { ignore: [button] })
useEventListener('keydown', event => {
  if (event.key === 'Escape') isOpen.value = false
})
useEventListener('scroll', updatePosition, { capture: true, passive: true })
useEventListener('resize', updatePosition)
</script>

<template>
  <div class="relative max-w-64 pr-6">
    <div ref="preview" class="line-clamp-3 break-words">{{ value }}</div>
    <button
      ref="button"
      v-if="hasOverflow"
      type="button"
      class="absolute top-0 right-0 w-5 h-5 rounded bg-gray-200 hover:bg-gray-300 flex justify-center items-center"
      :aria-label="`Show full ${column}`"
      :aria-expanded="isOpen"
      :aria-controls="isOpen ? popoverId : undefined"
      @click.stop="toggle"
    >
      <span class="i-mdi-open-in-new text-xs" />
    </button>
    <Teleport to="body">
      <div
        ref="popover"
        v-if="isOpen"
        :id="popoverId"
        role="dialog"
        :aria-label="`Full ${column}`"
        class="fixed z-60 w-96 max-h-80 overflow-auto rounded-md border border-gray-300 bg-white p-2 shadow-lg text-xs whitespace-pre-wrap break-words"
        :style="{ left: `${position.left}px`, top: `${position.top}px`, transform: 'translateX(-100%)' }"
      >{{ value }}</div>
    </Teleport>
  </div>
</template>
