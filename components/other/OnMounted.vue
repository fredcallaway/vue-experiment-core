<script lang="ts">
const onceCache = new Set<string>()
</script>

<script lang="ts" setup>

const props = defineProps<{
  fn: () => void
  once?: boolean | string
}>()


onMounted(() => {
  if (props.once) {
    const key = typeof props.once === 'string' ? props.once : props.fn.toString()
    if (onceCache.has(key)) {
      return
    }
    onceCache.add(key)
  }
  props.fn()
})
</script>

<template>
  <div>
    
  </div>
</template>