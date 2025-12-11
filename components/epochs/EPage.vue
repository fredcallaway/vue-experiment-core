<script lang="ts" setup>

const props = defineProps<{
  name?: string
  autoNext?: boolean
}>()

const epoch = useEpoch(props.name ?? 'EPage')

const emit = defineEmits<{ (e: 'mounted', epoch: Epoch): void }>()
onMounted(() => emit('mounted', epoch))

</script>

<template>
  <div class="EPage">
    <slot :epoch="epoch" :done="epoch.done" />
  </div>
</template>
