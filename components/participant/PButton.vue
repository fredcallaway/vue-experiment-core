<script lang="ts" setup>
const props = defineProps<{
  value: string
  unstyled?: boolean
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

</script>

<template>
  <button 
    :class="{ 'btn': !unstyled }" 
    @click="P.emit('click', value)"
    @mouseenter="P.emit('hover', value)"
    @mousedown="P.emit('mousedown', value)"
  >
    <slot v-if="$slots.default" />
    <template v-else>{{ value }}</template>
  </button>
</template> 