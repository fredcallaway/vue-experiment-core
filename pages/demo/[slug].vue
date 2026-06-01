<script lang="ts" setup>

// Single dynamic page for all demos. The slug selects a demo component from the
// manifest. Each demo's epoch tree lives in its component so that editing the demo
// triggers component-level HMR (preserving epoch state and the outline) rather than
// a full page teardown. See internal/demos/manifest.ts.
import { demos } from '../../internal/demos/manifest'

const route = useRoute()
const slug = computed(() => String(route.params.slug))
const demo = computed(() => demos[slug.value])

watchImmediate(demo, (entry) => {
  if (entry?.windowSize) {
    defineWindowSize(entry.windowSize)
  } else {
    resetWindowSize()
  }
})

</script>

<template>
  <!-- key on slug so the epoch tree fully remounts when switching demos -->
  <component :is="demo.component" v-if="demo" :key="slug" />
  <div v-else p10>
    <h2 text-xl font-bold>Unknown demo</h2>
    <p mt-2>
      No demo named <code>{{ slug }}</code>. See the
      <NuxtLink to="/demo">demo index</NuxtLink>.
    </p>
  </div>
</template>
