<script lang="ts" setup>
// Mounted only inside the hidden worker iframe (?outlineWorker=1). The outline panel does not
// render in the worker, so nothing else instantiates useEpochTree there; this component does, which
// kicks off the worker traversal (initializeOutline detects isOutlineWorker() and traverses, saves
// the cache, and broadcasts). See ADR 0003. Renders nothing.
useEpochTree()
</script>

<template>
  <span hidden />
</template>
