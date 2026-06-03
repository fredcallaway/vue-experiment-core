<script lang="ts" setup>
// Hidden iframe that runs outline traversal off the developer's tab (ADR 0003). The developer's tab
// can't traverse without leaving unrecoverable page state, so this iframe loads the same route in a
// throwaway context, traverses, saves the cache, and broadcasts; the developer's tab swaps the
// result into place without reloading. Mounted only in the dev layout (not in the worker itself).
const route = useRoute()

// Same route + params as the current page, plus the worker flag and noDev so the iframe renders the
// bare experiment (no outline panel → no recursion). Re-points when the developer changes pages.
const workerSrc = computed(() => {
  const params = new URLSearchParams(window.location.search)
  params.set('outlineWorker', '1')
  params.set('noDev', '1')
  return `${route.path}?${params.toString()}`
})
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
