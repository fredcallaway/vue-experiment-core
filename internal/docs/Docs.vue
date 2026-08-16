<script lang="ts" setup>

// The documentation as an epoch tree: each section is a branch, each subsection a
// DocsPage leaf, so the epoch outline doubles as the table of contents and
// click-to-jump is the navigation. The tree lives in this component (not in
// pages/docs.vue) so edits trigger component-level HMR that preserves the running
// epoch state and the outline.
import DocsOverview from './DocsOverview.vue'
import DocsEpochs from './DocsEpochs.vue'
import DocsComposition from './DocsComposition.vue'
import DocsData from './DocsData.vue'
import DocsConfig from './DocsConfig.vue'
import DocsDevtools from './DocsDevtools.vue'
import DocsExamples from './DocsExamples.vue'

</script>

<template>
  <div class="docs-content" w-full p6 text-left>
    <ESequence name="docs">
      <DocsOverview />
      <DocsEpochs />
      <DocsComposition />
      <DocsData />
      <DocsConfig />
      <DocsDevtools />
      <DocsExamples />
    </ESequence>
  </div>
</template>

<style>
.docs-content h2 {
  @apply text-2xl font-bold mb-3;
}
.docs-content h3 {
  @apply text-lg font-bold mb-2;
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
</style>
