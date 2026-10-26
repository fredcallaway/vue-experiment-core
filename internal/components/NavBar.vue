<script setup lang="ts">
import { useConfig } from '../../composables/useConfig'
import { useSessionStorage, watchImmediate } from '@vueuse/core'
import { useTutorialMode } from '../composables/useTutorialMode'
import { useUrlParams } from '../../utils/url-params'

const props = defineProps<{
  preview?: boolean
}>()
const router = useRouter()
const route = useRoute()
const urlParams = useUrlParams()
const { tutorialMode, toggleTutorialMode } = useTutorialMode()

const getSectionSegment = (path: string) => {
  const [segment] = path.split('/').filter(Boolean)
  return segment || 'dev'
}
const getTopPath = (path: string) => `/${getSectionSegment(path)}`
const isExperimentView = computed(() => getSectionSegment(route.path) === 'dev')
const lastSubroutesBySection = useSessionStorage<Record<string, string>>('nav:last-subroute', {})
const config = useConfig()

type NavLink = { label: string; path: string; preview?: boolean }
const topNavLinks: NavLink[] = [
  { label: 'Develop', path: '/dev', preview: false },
  { label: 'Preview', path: '/dev', preview: true },
  { label: 'Prolific', path: '/prolific' },
  { label: 'Data', path: '/data' },
  { label: 'Docs', path: '/docs' },
  { label: 'Examples', path: '/examples' },
  ...Object.entries(config.navPages ?? {}).map(([label, path]) => ({ label, path })),
]

const isActiveLink = (link: NavLink) => {
  if (link.preview !== undefined) return isExperimentView.value && Boolean(props.preview) === link.preview
  return getSectionSegment(route.path) === getSectionSegment(link.path)
}

watchImmediate(() => route.path, (path) => {
  const section = getSectionSegment(path)
  if (path === getTopPath(path)) delete lastSubroutesBySection.value[section]
  else lastSubroutesBySection.value[section] = path
})

const getNavTarget = (link: NavLink) => {
  if (link.preview !== undefined) {
    const query = isExperimentView.value ? { ...urlParams } : {}
    delete query.noDev
    delete query.preview
    if (link.preview) query.preview = '1'
    if (tutorialMode.value) query.tutorial = '1'
    return { path: link.path, query, hash: isExperimentView.value ? route.hash : '' }
  }
  const section = getSectionSegment(link.path)
  const path = isActiveLink(link) ? link.path : lastSubroutesBySection.value[section] ?? link.path
  if (!tutorialMode.value) return path
  const target = router.resolve(path)
  return { path: target.path, query: { ...target.query, tutorial: '1' }, hash: target.hash }
}
</script>

<template>
  <nav class="developer-nav h6 px1" :class="{ 'preview-nav': preview }" aria-label="Developer navigation">
    <div class="flex items-center gap-6">
      <span class="font-bold">{{ config.title }}</span>
      <NuxtLink
        v-for="link in topNavLinks"
        :key="link.label"
        :to="getNavTarget(link)"
        class="nav-link"
        :class="{ active: isActiveLink(link) }"
        :aria-current="isActiveLink(link) ? 'page' : undefined"
      >
        {{ link.label }}
      </NuxtLink>
      <button
        type="button"
        class="nav-link flex items-center gap-1 text-sm"
        :class="{ active: tutorialMode }"
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

<style scoped>
.developer-nav {
  color: black;
}

.preview-nav {
  color: white;
}

.nav-link {
  color: inherit;
  opacity: 0.45;
  text-decoration: none;
  transition: opacity 150ms;
}

.nav-link:hover,
.nav-link:focus-visible {
  opacity: 0.75;
}

.nav-link.active {
  opacity: 1;
}

.nav-link:focus-visible {
  outline: 1px solid currentColor;
  outline-offset: 4px;
}
</style>
