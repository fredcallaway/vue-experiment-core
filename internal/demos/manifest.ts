import { defineAsyncComponent, type Component } from 'vue'

// Registry of demo tutorials, keyed by URL slug (/demo/<slug>). The [slug] page renders the
// matching component, and the index lists them. Each demo's epoch tree lives in its component
// (not the page) so editing it triggers component-level HMR, which preserves the running epoch
// state and the outline; a page edit would tear the tree down and reset it to __TOP_EPOCH__.

export type DemoEntry = {
  // Card title shown on the index; defaults to the slug when omitted.
  title?: string
  // One-line summary of what the demo shows, displayed on the index card.
  summary: string
  component: () => Promise<{ default: Component }>
}

export const demos: Record<string, DemoEntry> = {
  basics: {
    title: 'Basics',
    summary: 'Building an experiment from epochs, pages, and sequences.',
    component: () => import('./BasicsDemo.vue'),
  },
  experiment: {
    title: 'Full experiment',
    summary: 'A short end-to-end study: consent, instructions, trials, survey, and completion.',
    component: () => import('./ExperimentDemo.vue'),
  },
  custom: {
    title: 'Custom epochs',
    summary: 'Writing your own leaf epoch: params, events, data views, and done().',
    component: () => import('./CustomEpochDemo.vue'),
  },
  responses: {
    title: 'Responses',
    summary: 'Collecting input: buttons and keys, declarative and script-side, plus gating.',
    component: () => import('./ResponsesDemo.vue'),
  },
  data: {
    title: 'Data',
    summary: 'The pipeline: typed events -> data views -> export rows, grouped per trial.',
    component: () => import('./DataDemo.vue'),
  },
  params: {
    title: 'Params & conditions',
    summary: 'defineParams overrides and useConditions assignment (with the dev inspector).',
    component: () => import('./ParamsDemo.vue'),
  },
  devtools: {
    title: 'Devtools',
    summary: 'The /dev panel: navigation controls, a live epoch outline, and an error boundary.',
    component: () => import('./DevtoolsDemo.vue'),
  },
  instructions: {
    title: 'Instructions',
    summary: 'Navigable instruction pages, gating Next until each page is completed.',
    component: () => import('./InstructionsDemo.vue'),
  },
  phases: {
    title: 'Phases',
    summary: 'One epoch with several visual phases that share state and animate between each other.',
    component: () => import('./PhasesDemo.vue'),
  },
  surveys: {
    title: 'Surveys',
    summary: 'Survey epochs (buttons, multi-buttons, text) and a project-declared data view.',
    component: () => import('./SurveysDemo.vue'),
  },
  timing: {
    title: 'Timing',
    summary: 'useTimer countdowns, fixed-duration pages, and awaitable sleeps.',
    component: () => import('./TimingDemo.vue'),
  },
}

export const demoSlugs = Object.keys(demos)

export const resolveDemoComponent = (entry: DemoEntry) => defineAsyncComponent(entry.component)
