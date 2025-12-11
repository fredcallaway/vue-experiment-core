<script lang="ts" setup>
const props = defineProps<{ 
  name?: string, 
  until: (...args: any[]) => Promise<any>,
}>()

const { registerAsync } = useLocalAsync()
const { done } = useEpoch(props.name ?? 'EWait')

const emit = defineEmits<{
  (e: 'done'): void
}>()

onMounted(async () => {
  await registerAsync(props.until())
  emit('done')
  done()
})

</script>

<template>
  <div>
    <slot></slot>
  </div>
</template> 