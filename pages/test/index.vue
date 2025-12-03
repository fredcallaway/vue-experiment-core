<script lang="ts" setup>

const router = useRouter()
const pages = router.getRoutes()
  .filter(r => r.path.startsWith('/test/'))  // or whatever subpath you want
  .filter(r => r.name !== 'test')
  .map(r => ({
    path: r.path,
    name: r.name?.toString().replace('test-', '') ?? '',
  }))
  .sort((a, b) => a.name.localeCompare(b.name))

resetWindowSize()

</script>

<template>
<div>
  <div flex="~ wrap gap-4" p-10>
    <NuxtLink btn-gray no-underline v-for="page in pages" :key="page.path" :to="page.path">
      {{ page.name }}
    </NuxtLink>
  </div>
</div>
</template>