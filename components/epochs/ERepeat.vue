<script lang="ts" setup>

const { name='ERepeat', count } = defineProps<{ name?: string, count: NumberLike }>()

const epoch = useIndexableEpoch(name, ensureNumber(count))
epoch.hasIdenticalChildren = true

const emit = defineEmits<{ (e: 'mounted', epoch: Epoch): void }>()
onMounted(() => emit('mounted', epoch))

if (count == 0) {
  epoch.done()
}

</script>

<template>
  <slot :key="epoch.step.value" :step="epoch.step.value" :epoch="epoch" :nSteps="count"></slot>
</template>
