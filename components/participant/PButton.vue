<script lang="ts" setup>
const props = defineProps<{
  value: string
  unstyled?: boolean
  color?: 'primary' | 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'gray' // from uno.config.ts
}>()


const emit = defineEmits<{
  (e: 'click', value: string): void
  (e: 'hover', value: string): void
  (e: 'mousedown', value: string): void
}>()

const P = useParticipant<{click: string, hover: string, mousedown: string}>('PButton')
P.on('click', (value: string) => {
  emit('click', value)
})
P.on('hover', (value: string) => {
  emit('hover', value)
})
P.on('mousedown', (value: string) => {
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

</script>

<template>
  <button 
    :class="classes" 
    @click="P.emit('click', value)"
    @mouseenter="P.emit('hover', value)"
    @mousedown="P.emit('mousedown', value)"
  >
    <slot v-if="$slots.default" />
    <template v-else>{{ value }}</template>
  </button>
</template> 