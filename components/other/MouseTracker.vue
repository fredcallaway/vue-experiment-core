<script lang="ts" setup>
import { useMouseTracking } from '../../composables/useMouseTracking'

const props = defineProps<{
  minPixels?: number
  minRate?: number
  maxRate?: number
  maxFrames?: number
}>()

useMouseTracking(props)
</script>

<template></template>
