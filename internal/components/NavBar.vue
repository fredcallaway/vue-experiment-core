<script setup lang="ts">
import { useConfig } from '../../composables/useConfig'
import { useSessionStorage, watchImmediate } from '@vueuse/core'
import { useTutorialMode } from '../composables/useTutorialMode'


const router = useRouter()
// Later: if we want to show subroutes
// const pages = router.getRoutes()
//   // .filter(r => r.path.startsWith('/docs/'))  // or whatever subpath you want
//   .map(r => ({
//     path: r.path,
//     name: r.name,
//   }))


const route = useRoute()
const { tutorialMode, toggleTutorialMode } = useTutorialMode()

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
  { label: 'Docs', path: '/docs' },
  { label: 'Examples', path: '/examples' },
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
  const section = getSectionSegment(linkPath)
  const path = isActiveLink(linkPath) ? linkPath : lastSubroutesBySection.value[section] ?? linkPath
  if (!tutorialMode.value) return path
  const target = router.resolve(path)
  return { path: target.path, query: { ...target.query, tutorial: '1' }, hash: target.hash }
}
</script>

<template>
  <nav class="h6 px1">
    <div class="flex items-center gap-6">
      <span class="font-bold">{{ config.title }}</span>
      <NuxtLink
        v-for="link in topNavLinks"
        :key="link.path"
        :to="getNavTarget(link.path)"
        :class="isActiveLink(link.path) ? 'text-black' : 'text-gray-300'"
      >
        {{ link.label }}
      </NuxtLink>
      <button
        type="button"
        class="flex items-center gap-1 text-sm transition-colors"
        :class="tutorialMode ? 'text-pink-600' : 'text-gray-400 hover:text-gray-600'"
        :aria-pressed="tutorialMode"
        :title="tutorialMode ? 'Disable tutorial mode' : 'Enable tutorial mode'"
        @click="toggleTutorialMode"
      >
        <span class="text-xl" :class="tutorialMode ? 'i-mdi-help-circle' : 'i-mdi-help-circle-outline'" />
        Tutorial
      </button>
    </div>
  </nav>
</template>
