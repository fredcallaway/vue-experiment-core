<script lang="ts" setup>

// Single dynamic page for all examples. The slug selects a component from the
// manifest. Each example's epoch tree lives in its component so that editing it
// triggers component-level HMR (preserving epoch state and the outline) rather than
// a full page teardown. See internal/examples/manifest.ts.
import { examples, resolveExampleComponent } from '../../internal/examples/manifest'

const route = useRoute()
const slug = computed(() => String(route.params.slug))
const example = computed(() => examples[slug.value])
const component = computed(() => example.value ? resolveExampleComponent(example.value) : undefined)

// use a narrow default for examples
// can override in the component file
defineWindowSize({ width: 700, height: 800 })

</script>

<template>
  <div class="example-page">
    <!-- key on slug so the epoch tree fully remounts when switching examples -->
    <component :is="component" v-if="component" :key="slug" />
    <div v-else p10>
      <h2 text-xl font-bold>Unknown example</h2>
      <p mt-2>
        No example named <code>{{ slug }}</code>. See the
        <NuxtLink to="/examples">examples index</NuxtLink>.
      </p>
    </div>
  </div>
</template>

<style>
.example-page ul, .example-page ol {
  margin-bottom: 0.5em;
  padding-inline-start: 1.5em;
}

.example-page ul {
  list-style: disc;
}

.example-page ol {
  list-style: decimal;
}

.example-page li {
  display: list-item;
}

</style>
