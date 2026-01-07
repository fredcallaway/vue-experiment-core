<script lang="ts" setup>

const props = defineProps<{
  name?: string
  prompt?: boolean
}>()

const epoch = useEpoch(props.name ?? 'EPage')

const emit = defineEmits<{ (e: 'mounted', epoch: Epoch): void }>()
onMounted(() => emit('mounted', epoch))

</script>

<template>
  <div :class="{ 'prompt': prompt }" >
    <slot :epoch="epoch" :done="epoch.done" />
  </div>
</template>
