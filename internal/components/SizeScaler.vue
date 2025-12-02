<script setup lang="ts">
const { enabled, percentage, scale } = useSizeScale()
const { violated } = useWindowEnforcer()

const scrollHandler = useScrollHandler((direction) => {
  percentage.value += direction * 5
})

const inverseScale = computed(() => 1 / scale.value)
const isNotDefault = computed(() => scale.value !== 1)
const isHovered = ref(false)

const opacity = computed(() => {
  if (isHovered.value) return 1.0
  if (violated.value) return 1.0
  if (isNotDefault.value) return 0.2
  return 0
})
</script>

<template>
  <div 
    v-if="enabled" 
    style="position: fixed; top: 2px; right: 2px; z-index: 50; transform-origin: top right;"
    :style="{ transform: `scale(${inverseScale})`, opacity: opacity }"
    class="transition-opacity"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
  >
    <span v-if="violated" text-xs text-red-500>
      try zooming out (dev mode only)
    </span>
    <input
      border-white hover:border-gray-100 border-1
      v-model.number="percentage"
      type="number"
      min="50"
      max="200"
      step="10"
      style="width: 26px; font-size: 14px; padding: 2px 4px; border-radius: 4px; appearance: textfield; -moz-appearance: textfield;"
      class="[&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      title="Zoom (scroll to adjust)"
      @wheel="scrollHandler"
    />

    
  </div>
</template>

