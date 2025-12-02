<script lang="ts" setup>
const { name='EDelay', ms = 1000 } = defineProps<{ name?: string, ms?: number }>()

const { sleep, onMountedAsync } = useLocalAsync()
const { done } = useEpoch(name)

const emit = defineEmits<{
  (e: 'done'): void
}>()

onMountedAsync(async () => {
  await sleep(ms)
  emit('done')
  done()
})

</script>

<template>
  <div v-if="useSlots().default">
    <slot></slot>
  </div>
</template> 