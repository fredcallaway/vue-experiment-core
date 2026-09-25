<script lang="ts" setup>
import DocsPage from './DocsPage.vue'
import { examples } from '../examples/manifest'

const entries = Object.entries(examples)
</script>

<template>
  <DocsPage name="examples" last>
    <h2>Examples</h2>
    <p>
      Each example is a live, minimal reference implementation of one pattern — the code to
      copy when building your own. The source lives in
      <code>core/internal/examples/</code>; read it alongside the running page.
    </p>
    <div class="grid grid-cols-1 sm:grid-cols-2 grid-gap-3 mt4">
      <NuxtLink
        class="p-4 rounded-lg bg-gray-100 no-underline text-inherit hover-bg-gray-200 block"
        v-for="[slug, example] in entries"
        :key="slug"
        :to="`/examples/${slug}`"
      >
        <h4 class="font-semibold m0">{{ example.title ?? slug }}</h4>
        <p class="mt1 mb0 text-sm text-gray-600">{{ example.summary }}</p>
      </NuxtLink>
    </div>
  </DocsPage>
</template>
