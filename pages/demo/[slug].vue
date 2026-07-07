<script lang="ts" setup>

// Single dynamic page for all demos. The slug selects a demo component from the
// manifest. Each demo's epoch tree lives in its component so that editing the demo
// triggers component-level HMR (preserving epoch state and the outline) rather than
// a full page teardown. See internal/demos/manifest.ts.
import { demos, resolveDemoComponent } from '../../internal/demos/manifest'

const route = useRoute()
const slug = computed(() => String(route.params.slug))
const demo = computed(() => demos[slug.value])
const component = computed(() => demo.value ? resolveDemoComponent(demo.value) : undefined)

// use a narrow default for demos
// can override in the component file
defineWindowSize({ width: 700, height: 800 })

</script>

<template>
  <div class="demo-page">
    <!-- key on slug so the epoch tree fully remounts when switching demos -->
    <component :is="component" v-if="component" :key="slug" />
    <div v-else p10>
      <h2 text-xl font-bold>Unknown demo</h2>
      <p mt-2>
        No demo named <code>{{ slug }}</code>. See the
        <NuxtLink to="/demo">demo index</NuxtLink>.
      </p>
    </div>
  </div>
</template>

<style>
.demo-page ul, .demo-page ol {
  margin-bottom: 0.5em;
  padding-inline-start: 1.5em;
}

.demo-page ul {
  list-style: disc;
}

.demo-page ol {
  list-style: decimal;
}

.demo-page li {
  display: list-item;
}

</style>
