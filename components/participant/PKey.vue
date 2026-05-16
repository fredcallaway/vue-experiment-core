<script lang="ts" setup>

const props = defineProps<{
  keys?: string | Key[]
  once?: boolean
  maxTime?: number
}>()

const emit = defineEmits<{
  (e: 'press', key: KeyPress): void
  (e: 'timeout'): void
}>()

const live = ref(true)

const unsub = onKeyPress(props.keys, (keyPress) => {
  if (props.once) {
    live.value = false
    unsub()
  }
  emit('press', keyPress)
})
onUnmounted(unsub)

const { sleep } = useLocalAsync()
onMounted(async () => {
  if (props.maxTime) {
    await sleep(props.maxTime)
    live.value = false
    unsub()
    emit('timeout')
  }
})
</script>

<template>
  <slot v-if="live"></slot>
</template>
