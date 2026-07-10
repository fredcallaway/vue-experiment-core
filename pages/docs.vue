<script lang="ts" setup>

// Human-facing documentation: one scrollable page, with the outline on the left as
// the index. Section content lives in core/internal/docs/ (one component per
// section); the live examples at /examples are the reference implementations this
// page links into.
import DocsOverview from '../internal/docs/DocsOverview.vue'
import DocsEpochs from '../internal/docs/DocsEpochs.vue'
import DocsComposition from '../internal/docs/DocsComposition.vue'
import DocsData from '../internal/docs/DocsData.vue'
import DocsConfig from '../internal/docs/DocsConfig.vue'
import DocsDevtools from '../internal/docs/DocsDevtools.vue'
import DocsExamples from '../internal/docs/DocsExamples.vue'

definePageMeta({
  layout: 'dashboard',
})

const sections = [
  { id: 'overview', title: 'Overview' },
  { id: 'epochs', title: 'Epochs' },
  { id: 'composition', title: 'Composing an experiment' },
  { id: 'data', title: 'Recording data' },
  { id: 'configuration', title: 'Params and conditions' },
  { id: 'devtools', title: 'Devtools' },
  { id: 'examples', title: 'Examples' },
]

</script>

<template>
  <div flex max-w-5xl mx-auto p8 gap-10 items-start>

    <!-- The outline: the user-facing index of the documentation. -->
    <nav class="docs-outline" w-52 shrink-0 sticky top-8 hidden md:flex flex-col gap-1>
      <div text-xs font-bold text-gray-400 uppercase mb1>Contents</div>
      <a v-for="s in sections" :key="s.id" :href="`#${s.id}`">{{ s.title }}</a>
    </nav>

    <div class="docs-content" flex-1 min-w-0>
      <h1>Documentation</h1>
      <DocsOverview />
      <DocsEpochs />
      <DocsComposition />
      <DocsData />
      <DocsConfig />
      <DocsDevtools />
      <DocsExamples />
    </div>

  </div>
</template>

<style scoped>
.docs-outline a {
  @apply text-sm text-gray-600 no-underline rounded px-2 py-1;
}
.docs-outline a:hover {
  @apply bg-gray-100 text-gray-900;
}
</style>

<style>
.docs-content h1 {
  @apply text-3xl font-bold mb-6;
}
.docs-content h2 {
  @apply text-2xl font-bold mt-10 mb-3 pt-4 border-t border-gray-200;
}
.docs-content h3 {
  @apply text-lg font-bold mt-6 mb-2;
}
.docs-content p {
  @apply my-3 leading-relaxed;
}
.docs-content ul, .docs-content ol {
  @apply my-3 pl-6 flex flex-col gap-2;
}
.docs-content ul {
  list-style: disc;
}
.docs-content ol {
  list-style: decimal;
}
.docs-content li {
  display: list-item;
}
.docs-content section {
  scroll-margin-top: 1rem;
}
</style>
