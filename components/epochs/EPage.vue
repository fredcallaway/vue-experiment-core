<script lang="ts" setup>

const props = defineProps<{
  name?: string
  prompt?: boolean
  duration?: NumberLike
}>()

const epoch = useEpoch(props.name ?? 'EPage')
const { sleep } = useLocalAsync()

const emit = defineEmits<{ (e: 'mounted', epoch: Epoch): void }>()
onMounted(async () => {
  emit('mounted', epoch)
  if (R.isDefined(props.duration)) {
    await sleep(ensureNumber(props.duration))
    epoch.done()
  }
})

</script>

<template>
  <div :class="{ 'prompt': prompt }" >
    <slot :epoch="epoch" :done="epoch.done" />
  </div>
</template>
