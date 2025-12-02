<script setup lang="ts">

const router = useRouter()
// Later: if we want to show subroutes
// const pages = router.getRoutes()
//   // .filter(r => r.path.startsWith('/docs/'))  // or whatever subpath you want
//   .map(r => ({
//     path: r.path,
//     name: r.name,
//   }))


const route = useRoute()

const topNavLinks = [
  { label: 'Experiment', path: '/dev' },
  { label: 'Prolific', path: '/prolific' },
  { label: 'Data', path: '/data' },
  { label: 'Test', path: '/test' },
]

const isActiveLink = (linkPath: string) => {
  const routeSegments = route.path.split('/').filter(Boolean)
  const linkSegments = linkPath.split('/').filter(Boolean)
  return routeSegments[0] === linkSegments[0]
}
</script>

<template>
  <nav class="bg-white h-5 pl-4">
    <div class="flex items-center gap-6">
      <NuxtLink
        v-for="link in topNavLinks"
        :key="link.path"
        :to="link.path"
        :class="isActiveLink(link.path) ? 'text-black cursor-default' : 'text-gray-300'"
      >
        {{ link.label }}
      </NuxtLink>
    </div>
  </nav>
</template>

