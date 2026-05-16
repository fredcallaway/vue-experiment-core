<script lang="ts" setup>

const props = defineProps<{
  value: string
  label?: string
  unstyled?: boolean
  color?: 'primary' | 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'gray' // from uno.config.ts
  disabled?: boolean
  delay?: NumberLike
  once?: boolean
  P?: Participant<{
    click: string;
    hover: string;
    mousedown: string;
  }>
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

const P = props.P ?? useParticipant<{click: string, hover: string, mousedown: string}>('PButton')

P.on('click', (value: string) => {
  if (disabled.value) return
  clicked.value = true
  emit('click', value)
})
P.on('hover', (value: string) => {
  if (disabled.value) return
  emit('hover', value)
})
P.on('mousedown', (value: string) => {
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
  on: P.on,
  promise: P.promise,
})

</script>

<template>
  <button v-if="!once || !clicked"
    :class="[
      btnClass, 
      PARTICIPANT_INPUT_BLOCKED && 'pointer-events-none',
    ]" 
    :disabled="disabled"
    @click="P.emit('click', value)"
    @mouseenter="P.emit('hover', value)"
    @mousedown="P.emit('mousedown', value)"
  >
    <slot v-if="$slots.default" />
    <template v-else>{{ label ?? value }}</template>
  </button>
</template> 
