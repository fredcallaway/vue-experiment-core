import type { Component } from 'vue'
import BasicsDemo from './BasicsDemo.vue'
import CustomEpochDemo from './CustomEpochDemo.vue'
import DevtoolsDemo from './DevtoolsDemo.vue'
import InstructionsDemo from './InstructionsDemo.vue'
import PhasesDemo from './PhasesDemo.vue'

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
  // Minimum window size enforced while the demo runs (defaults to 800x600 when omitted).
  windowSize?: { width: number; height: number }
}

export const demos: Record<string, DemoEntry> = {
  basics: {
    title: 'Basics',
    summary: 'Building an experiment from epochs, pages, and sequences.',
    component: BasicsDemo,
    windowSize: { width: 600, height: 800 },
  },
  'custom-epoch': {
    title: 'Custom epoch',
    summary: 'Writing your own leaf epoch: params, events, data views, and done().',
    component: CustomEpochDemo,
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
}

export const demoSlugs = Object.keys(demos)
