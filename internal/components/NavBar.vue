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

const getSectionSegment = (path: string) => {
  const [segment] = path.split('/').filter(Boolean)
  if (!segment) return 'dev' // we will ultimately reroute to dev
  return segment
}

const getTopPath = (path: string) => `/${getSectionSegment(path)}`

const lastSubroutesBySection = useSessionStorage<Record<string, string>>(
  'nav:last-subroute',
  {},
)

const config = useConfig()

const topNavLinks = [
  { label: 'Experiment', path: '/dev' },
  { label: 'Prolific', path: '/prolific' },
  { label: 'Data', path: '/data' },
  { label: 'Demo', path: '/demo' },
  { label: 'Test', path: '/test' },
  ...Object.entries(config.navPages ?? {}).map(([label, path]) => ({ label, path })),
]

const isActiveLink = (linkPath: string) => {
  const routeSegments = route.path.split('/').filter(Boolean)
  const linkSegments = linkPath.split('/').filter(Boolean)
  return routeSegments[0] === linkSegments[0]
}

watchImmediate(
  () => route.path,
  (path) => {
    const section = getSectionSegment(path)
    const topPath = getTopPath(path)
    if (path === topPath) {
      delete lastSubroutesBySection.value[section]
      return
    }
    lastSubroutesBySection.value[section] = path
  },
)

const getNavTarget = (linkPath: string) => {
  if (isActiveLink(linkPath)) return linkPath
  const section = getSectionSegment(linkPath)
  return lastSubroutesBySection.value[section] ?? linkPath
}
</script>

<template>
  <nav h6 px1>
    <div class="flex items-center gap-6">
      <NuxtLink
        v-for="link in topNavLinks"
        :key="link.path"
        :to="getNavTarget(link.path)"
        :class="isActiveLink(link.path) ? 'text-black cursor-default' : 'text-gray-300'"
      >
        {{ link.label }}
      </NuxtLink>
    </div>
  </nav>
</template>

