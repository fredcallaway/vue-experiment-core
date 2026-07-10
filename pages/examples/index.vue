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
  <div max-w-5xl mx-auto p8>
    <h1 text-2xl font-bold mb2>Examples</h1>
    <p text-gray-600 mb6>
      Live, minimal reference implementations of the template's patterns. Each is a
      component under <code>core/internal/examples/</code> — read the source alongside
      the running page. New to the template? Start with the
      <NuxtLink to="/docs">docs</NuxtLink>.
    </p>
    <div grid="~ cols-1 sm:cols-2 gap-4">
      <NuxtLink
        v-for="[slug, example] in entries"
        :key="slug"
        :to="`/examples/${slug}`"
        card
        bg-gray-100
        no-underline
        text-inherit
        hover="bg-gray-200"
        block
      >
        <h3 text-lg font-semibold>{{ example.title ?? slug }}</h3>
        <p mt1 text-sm text-gray-600>{{ example.summary }}</p>
      </NuxtLink>
    </div>
  </div>
</template>
