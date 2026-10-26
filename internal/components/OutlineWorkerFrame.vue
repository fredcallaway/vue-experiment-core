<script lang="ts" setup>
// Hidden iframe that runs outline traversal off the developer's tab (ADR 0003). The developer's tab
// can't traverse without leaving unrecoverable page state, so this iframe loads the same route in a
// throwaway context, traverses, saves the cache, and broadcasts; the developer's tab swaps the
// result into place without reloading. Mounted in Develop and Preview, never in the worker itself.
const route = useRoute()

// The worker flag selects a bare layout with no outline panel, preventing recursive workers.
// Re-points when the developer changes pages; mode switches keep the existing worker alive.
const workerSrc = ref('')
watch(() => route.path, (path) => {
  const params = new URLSearchParams(window.location.search)
  params.set('outlineWorker', '1')
  params.delete('noDev')
  params.set('preview', '1')
  workerSrc.value = `${path}?${params.toString()}`
}, { immediate: true })
</script>

<template>
  <iframe
    :src="workerSrc"
    title="outline-worker"
    aria-hidden="true"
    tabindex="-1"
    class="pointer-events-none fixed left-0 top-0 h-px w-px opacity-0"
  />
</template>
