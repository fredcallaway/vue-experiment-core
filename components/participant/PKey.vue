<script lang="ts" setup>
const props = defineProps<{
  keys?:  string | Key[]
  once?: boolean
}>()

const emit = defineEmits<{
  (e: 'press', key: KeyPress): void
}>()

const spec = validateKeySpec(props.keys)
const P = useParticipant('PKey')
P.onKeyPress(spec, (keyPress) => emit('press', keyPress), {once: props.once})
</script>

<template>
  <slot></slot>
</template>