<script lang="ts" setup>

// Lists the examples from the manifest as cards, in manifest order. Each links to
// /examples/<slug>, handled by [slug].vue.
import { examples } from '../../internal/examples/manifest'

definePageMeta({
  layout: 'dashboard',
})

const entries = Object.entries(examples)

</script>

<template>
  <div class="max-w-5xl mx-auto p8">
    <h1 class="text-2xl font-bold mb2">Examples</h1>
    <p class="text-gray-600 mb6">
      Live, minimal reference implementations of the template's patterns. Each is a
      component under <code>core/internal/examples/</code> — read the source alongside
      the running page. New to the template? Start with the
      <NuxtLink to="/docs">docs</NuxtLink>.
    </p>
    <div class="grid grid-cols-1 sm:grid-cols-2 grid-gap-4">
      <NuxtLink
        class="p-4 rounded-lg bg-gray-100 no-underline text-inherit hover-bg-gray-200 block"
        v-for="[slug, example] in entries"
        :key="slug"
        :to="`/examples/${slug}`"
      >
        <h3 class="text-lg font-semibold">{{ example.title ?? slug }}</h3>
        <p class="mt1 text-sm text-gray-600">{{ example.summary }}</p>
      </NuxtLink>
    </div>
  </div>
</template>
