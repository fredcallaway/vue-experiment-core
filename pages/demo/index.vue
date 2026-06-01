<script lang="ts" setup>

// Lists the demos from the manifest as cards, in manifest order. Each links to
// /demo/<slug>, handled by [slug].vue.
import { demos } from '../../internal/demos/manifest'

definePageMeta({
  layout: 'dashboard',
})

const entries = Object.entries(demos)

</script>

<template>
  <div max-w-5xl mx-auto p8>
    <h1 text-2xl font-bold mb6>Demos</h1>
    <div grid="~ cols-1 sm:cols-2 gap-4">
      <NuxtLink
        v-for="[slug, demo] in entries"
        :key="slug"
        :to="`/demo/${slug}`"
        card
        bg-gray-100
        no-underline
        text-inherit
        hover="bg-gray-200"
        block
      >
        <h3 text-lg font-semibold>{{ demo.title ?? slug }}</h3>
        <p mt1 text-sm text-gray-600>{{ demo.summary }}</p>
      </NuxtLink>
    </div>
  </div>
</template>
