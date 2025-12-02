<script lang="ts" setup>
// import { mainContentRef } from '~/utils/globals'

const style = computed(() => {
  let rect = mainContentRef.value?.getBoundingClientRect()
  if (!rect) {
    rect = document.documentElement.getBoundingClientRect()
  }
  return {
    width: rect.width + 'px',
    height: rect.height + 'px',
    top: rect.top + 'px',
    left: rect.left + 'px',
  }
})

</script>

<template>
  <div absolute :style="style">
  <slot />
  </div>
</template>