<script lang="ts" setup>
const props = defineProps<{
  minPixels?: number
  minRate?: number
  maxRate?: number
  maxFrames?: number
}>()

useMouseTracking(props)
</script>

<template></template>
