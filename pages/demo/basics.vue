<script lang="ts" setup>

// Thin page wrapper. The actual tutorial — and the epoch tree — lives in the
// BasicsDemo component so that editing the content triggers component-level HMR
// (which preserves the running epoch state and outline) rather than a full page
// teardown (which resets currentEpoch to __TOP_EPOCH__ and breaks the outline).
import BasicsDemo from '../../internal/demos/BasicsDemo.vue'

defineWindowSize({
  width: 600,
  height: 800,
})

</script>

<template>
  <BasicsDemo />
</template>
