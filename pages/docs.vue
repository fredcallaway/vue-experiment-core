<script lang="ts" setup>

// Human-facing documentation, structured as an epoch tree so the epoch outline in
// the dev chrome is the table of contents. The tree lives in internal/docs/Docs.vue
// (component-level HMR preserves epoch state); this page is just the shell.
import Docs from '../internal/docs/Docs.vue'

defineWindowSize({ width: 720, height: 800 })

</script>

<template>
  <Docs />
</template>
