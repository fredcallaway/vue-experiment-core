<script lang="ts" setup>
import { useMounted } from '@vueuse/core'

defineProps<{
  class?: string
}>()

const mounted = useMounted()
</script>

<template>
  <Teleport v-if="mounted" to="#main-content-overlay">
    <div class="absolute inset-0 pointer-events-auto" :class="$props.class">
      <slot />
    </div>
  </Teleport>
</template>
