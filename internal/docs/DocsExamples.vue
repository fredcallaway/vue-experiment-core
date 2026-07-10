<script lang="ts" setup>
import { examples } from '../examples/manifest'

const entries = Object.entries(examples)
</script>

<template>
  <section id="examples">
    <h2>Examples</h2>
    <p>
      Each example is a live, minimal reference implementation of one pattern — the code to
      copy when building your own. The source lives in
      <code>core/internal/examples/</code>; read it alongside the running page.
    </p>
    <div grid="~ cols-1 sm:cols-2 gap-3" mt4>
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
        <h4 font-semibold m0>{{ example.title ?? slug }}</h4>
        <p mt1 mb0 text-sm text-gray-600>{{ example.summary }}</p>
      </NuxtLink>
    </div>
  </section>
</template>
