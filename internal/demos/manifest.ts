import type { Component } from 'vue'
import BasicsDemo from './BasicsDemo.vue'
import CustomEpochDemo from './CustomEpochDemo.vue'
import DataDemo from './DataDemo.vue'
import DevtoolsDemo from './DevtoolsDemo.vue'
import InstructionsDemo from './InstructionsDemo.vue'
import ParamsDemo from './ParamsDemo.vue'
import PhasesDemo from './PhasesDemo.vue'
import ResponsesDemo from './ResponsesDemo.vue'
import SurveysDemo from './SurveysDemo.vue'
import TimingDemo from './TimingDemo.vue'

// Registry of demo tutorials, keyed by URL slug (/demo/<slug>). The [slug] page renders the
// matching component, and the index lists them. Each demo's epoch tree lives in its component
// (not the page) so editing it triggers component-level HMR, which preserves the running epoch
// state and the outline; a page edit would tear the tree down and reset it to __TOP_EPOCH__.

export type DemoEntry = {
  // Card title shown on the index; defaults to the slug when omitted.
  title?: string
  // One-line summary of what the demo shows, displayed on the index card.
  summary: string
  component: Component
}

export const demos: Record<string, DemoEntry> = {
  basics: {
    title: 'Basics',
    summary: 'Building an experiment from epochs, pages, and sequences.',
    component: BasicsDemo,
  },
  'custom-epoch': {
    title: 'Custom epoch',
    summary: 'Writing your own leaf epoch: params, events, data views, and done().',
    component: CustomEpochDemo,
  },
  responses: {
    title: 'Responses',
    summary: 'Collecting input: buttons and keys, declarative and script-side, plus gating.',
    component: ResponsesDemo,
  },
  data: {
    title: 'Data',
    summary: 'The pipeline: typed events -> data views -> export rows, grouped per trial.',
    component: DataDemo,
  },
  params: {
    title: 'Params & conditions',
    summary: 'defineParams overrides and useConditions assignment (with the dev inspector).',
    component: ParamsDemo,
  },
  devtools: {
    title: 'Devtools',
    summary: 'The /dev panel: navigation controls, a live epoch outline, and an error boundary.',
    component: DevtoolsDemo,
  },
  instructions: {
    title: 'Instructions',
    summary: 'Navigable instruction pages, gating Next until each page is completed.',
    component: InstructionsDemo,
  },
  phases: {
    title: 'Phases',
    summary: 'One epoch with several visual phases that share state and animate between each other.',
    component: PhasesDemo,
  },
  surveys: {
    title: 'Surveys',
    summary: 'Survey epochs (buttons, multi-buttons, text) and a project-declared data view.',
    component: SurveysDemo,
  },
  timing: {
    title: 'Timing',
    summary: 'useTimer countdowns, fixed-duration pages, and awaitable sleeps.',
    component: TimingDemo,
  },
}

export const demoSlugs = Object.keys(demos)
