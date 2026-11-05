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

type NavLink = { label: string; path: string; help: string; preview?: boolean }
const topNavLinks: NavLink[] = [
  {
    label: 'Develop', path: '/dev', preview: false,
    help: 'Run your experiment alongside the epoch outline, controls, data preview, and event log.',
  },
  {
    label: 'Preview', path: '/dev', preview: true,
    help: 'See the participant view with a floating outline. Switching modes keeps your current experiment running.',
  },
  { label: 'Prolific', path: '/prolific', help: 'Create studies, manage recruitment, and review submissions and bonuses.' },
  { label: 'Data', path: '/data', help: 'Browse saved sessions and export the data recorded by your experiment.' },
  { label: 'Docs', path: '/docs', help: 'Read the guide to experiment structure, configuration, data, and developer tools.' },
  { label: 'Examples', path: '/examples', help: 'Try runnable examples and use their source as a starting point.' },
  ...Object.entries(config.navPages ?? {}).map(([label, path]) => ({
    label, path, help: 'Open this custom project page configured in epoch.config.ts.',
  })),
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
    <div class="flex items-center gap-6 w-full">
      <TutorialTarget
        as="span"
        class="font-bold shrink-0"
        title="Experiment title"
        help="The experiment title is configured in epoch.config.ts."
      >{{ config.title }}</TutorialTarget>
      <TutorialTarget
        as="span"
        v-for="link in topNavLinks"
        :key="link.label"
        class="shrink-0"
        :title="link.label"
        :help="link.help"
      >
        <NuxtLink
          :to="getNavTarget(link)"
          class="nav-link"
          :class="{ active: isActiveLink(link) }"
          :aria-current="isActiveLink(link) ? 'page' : undefined"
        >{{ link.label }}</NuxtLink>
      </TutorialTarget>
      <div class="ml-auto flex items-center gap-4 shrink-0">
        <DebugSaving v-if="isExperimentView" :preview="preview" />
        <TutorialTarget
          as="span"
          class="flex shrink-0"
          :title="tutorialMode ? 'Disable tutorial mode' : 'Enable tutorial mode'"
          help="Show or hide pink highlights. Hover or focus a highlighted control to read its explanation."
          placement="left"
        >
          <button
            type="button"
            class="nav-link tutorial-toggle flex items-center"
            :class="{ active: tutorialMode }"
            :aria-pressed="tutorialMode"
            aria-label="Tutorial"
            @click="toggleTutorialMode"
          >
            <span class="text-xl" :class="tutorialMode ? 'i-mdi-help-circle' : 'i-mdi-help-circle-outline'" />
          </button>
        </TutorialTarget>
      </div>
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

.tutorial-toggle.active {
  color: #db2777;
}

.nav-link:focus-visible {
  outline: 1px solid currentColor;
  outline-offset: 4px;
}
</style>
