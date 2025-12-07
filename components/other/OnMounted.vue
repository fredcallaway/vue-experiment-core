<script lang="ts">
const onceCache = new Set<string>()
</script>

<script lang="ts" setup>
const { sleep } = useLocalAsync()

const props = defineProps<{
  fn: () => void
  once?: boolean | string
  delay?: number
}>()


onMounted(async () => {
  if (props.once) {
    const key = typeof props.once === 'string' ? props.once : props.fn.toString()
    if (onceCache.has(key)) {
      return
    }
    onceCache.add(key)
  }
  if (props.delay) {
    await sleep(props.delay)
  }
  props.fn()
})

</script>

<template>
</template>