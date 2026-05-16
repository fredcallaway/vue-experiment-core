<script lang="ts" setup>
import { createEventController, type EventController } from '~/core/utils/eventController'

type PButtonTypeMap = {
  click: string
  hover: string
  mousedown: string
}

const props = defineProps<{
  value: string
  label?: string
  unstyled?: boolean
  color?: 'primary' | 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'gray' // from uno.config.ts
  disabled?: boolean
  delay?: NumberLike
  once?: boolean
  controller?: EventController<PButtonTypeMap>
}>()


const emit = defineEmits<{
  (e: 'click', value: string): void
  (e: 'hover', value: string): void
  (e: 'mousedown', value: string): void
}>()


const ms = ensureNumber(props.delay ?? 0)
const ready = useTimeout(replaceFast(ms, Math.max(200, ms / 5)))
const disabled = computed(() => props.disabled || !ready.value)
const clicked = ref(false)

const controller = props.controller ?? createEventController<PButtonTypeMap>()

controller.on('click', (value: string) => {
  if (disabled.value) return
  clicked.value = true
  emit('click', value)
})
controller.on('hover', (value: string) => {
  if (disabled.value) return
  emit('hover', value)
})
controller.on('mousedown', (value: string) => {
  if (disabled.value) return
  emit('mousedown', value)
})

const attrs = useAttrs()

const btnClass = computed(() => {
  const hasBtn = String(attrs.class ?? '').includes('btn-') || Object.keys(attrs).some(k => k.includes('btn-'))
  if (hasBtn) return false
  if (props.unstyled) return false
  if (props.color) return `btn-${props.color}`
  return 'btn-primary'
})

defineExpose({
  on: controller.on,
  promise: controller.promise,
})

</script>

<template>
  <button v-if="!once || !clicked"
    :class="[
      btnClass, 
    ]" 
    :disabled="disabled"
    @click="controller.emit('click', value)"
    @mouseenter="controller.emit('hover', value)"
    @mousedown="controller.emit('mousedown', value)"
  >
    <slot v-if="$slots.default" />
    <template v-else>{{ label ?? value }}</template>
  </button>
</template> 
