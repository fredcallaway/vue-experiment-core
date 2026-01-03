<script lang="ts" setup>
const props = defineProps<{
  value: string
  unstyled?: boolean
  color?: 'primary' | 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'gray' // from uno.config.ts
  disabled?: boolean
  delay?: NumberLike
}>()


const emit = defineEmits<{
  (e: 'click', value: string): void
  (e: 'hover', value: string): void
  (e: 'mousedown', value: string): void
}>()


const ms = ensureNumber(props.delay ?? 0)
const ready = useTimeout(replaceFast(ms, Math.max(200, ms / 5)))
const disabled = computed(() => props.disabled || !ready.value)


const playbackState = usePlaybackState().state
const isPlaybackHover = ref(false)
const isPlaybackDown = ref(false)
const hoverOff = useTimeoutFn(() => { isPlaybackHover.value = false }, 250, { immediate: false })
const downOff = useTimeoutFn(() => { isPlaybackDown.value = false }, 150, { immediate: false })

watch(playbackState, (s) => {
  if (s === 'playing') return
  isPlaybackHover.value = false
  isPlaybackDown.value = false
  hoverOff.stop()
  downOff.stop()
})

const P = useParticipant<{click: string, hover: string, mousedown: string}>('PButton')
P.on('click', (value: string) => {
  if (playbackState.value === 'playing') {
    isPlaybackDown.value = false
    downOff.stop()
  }
  if (disabled.value) return
  emit('click', value)
})
P.on('hover', (value: string) => {
  if (playbackState.value === 'playing') {
    isPlaybackHover.value = true
    hoverOff.start()
  }
  if (disabled.value) return
  emit('hover', value)
})
P.on('mousedown', (value: string) => {
  if (playbackState.value === 'playing') {
    isPlaybackDown.value = true
    downOff.start()
  }
  if (disabled.value) return
  emit('mousedown', value)
})

const attrs = useAttrs()

const classes = computed(() => {
  const hasBtn = String(attrs.class ?? '').includes('btn-') || Object.keys(attrs).some(k => k.includes('btn-'))
  if (hasBtn) return []
  if (props.unstyled) return []
  if (props.color) return `btn-${props.color}`
  return 'btn-primary'
})

const playbackFxClasses = computed(() => {
  if (playbackState.value !== 'playing') return []
  return [
    'transition-transform',
    isPlaybackHover.value && 'brightness-110',
    isPlaybackDown.value && 'scale-95 brightness-90',
  ].filter(Boolean)
})



</script>

<template>
  <button 
    :class="[classes, playbackFxClasses]" 
    :disabled="disabled"
    @click="P.emit('click', value)"
    @mouseenter="P.emit('hover', value)"
    @mousedown="P.emit('mousedown', value)"
  >
    <slot v-if="$slots.default" />
    <template v-else>{{ value }}</template>
  </button>
</template> 