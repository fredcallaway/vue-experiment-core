<script lang="ts" setup>
defineProps<{
  class?: string
}>()

const mounted = useMounted()
</script>

<template>
  <Teleport v-if="mounted" to="#main-content-overlay">
    <div absolute inset-0 pointer-events-auto :class="$props.class">
      <slot />
    </div>
  </Teleport>
</template>
