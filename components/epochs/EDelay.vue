<script lang="ts" setup>

const props = defineProps<{ 
  name?: string, 
  ms: NumberLike,
}>()

const { sleep } = useLocalAsync()
const { done } = useEpoch(props.name ?? 'EDelay')

const emit = defineEmits<{
  (e: 'done'): void
}>()

onMounted(async () => {
  await sleep(ensureNumber(props.ms))
  emit('done')
  done()
})

</script>

<template>
  <div>
    <slot></slot>
  </div>
</template> 