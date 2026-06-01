<script lang="ts" setup>

// Lists the demos from the manifest. Each links to /demo/<slug>, handled by [slug].vue.
import { demoSlugs } from '../../internal/demos/manifest'

const slugs = [...demoSlugs].sort((a, b) => a.localeCompare(b))

resetWindowSize()

</script>

<template>
<div>
  <div flex="~ wrap gap-4" p-10>
    <NuxtLink btn-gray no-underline v-for="slug in slugs" :key="slug" :to="`/demo/${slug}`">
      {{ slug }}
    </NuxtLink>
  </div>
</div>
</template>
