import { defineAsyncComponent, type Component } from 'vue'

// Registry of live examples, keyed by URL slug (/examples/<slug>). The [slug] page
// renders the matching component and the index lists them. README.md in this
// directory is the agent-facing index of the same material.
//
// Each example's epoch tree lives in its component (not the page) so editing it
// triggers component-level HMR, which preserves the running epoch state and the
// outline; a page edit would tear the tree down and reset it to __TOP_EPOCH__.

export type ExampleEntry = {
  // Card title shown on the index; defaults to the slug when omitted.
  title?: string
  // One-line summary of what the example shows, displayed on the index card.
  summary: string
  component: () => Promise<{ default: Component }>
}

export const examples: Record<string, ExampleEntry> = {
  study: {
    title: 'Complete study',
    summary: 'The complete pattern: interactive instructions (scripted demos, practice, quiz), conditions, block structure, survey, completion.',
    component: () => import('./StudyExample.vue'),
  },
  trial: {
    title: 'Custom trial',
    summary: 'The canonical trial component: params, typed events, data view, phases, done().',
    component: () => import('./TrialExample.vue'),
  },
  phases: {
    title: 'Phases',
    summary: 'One epoch with several visual phases that share state.',
    component: () => import('./PhasesExample.vue'),
  },
  responses: {
    title: 'Responses',
    summary: 'Buttons and keys, declarative and script-side, plus input gating.',
    component: () => import('./ResponsesExample.vue'),
  },
  timing: {
    title: 'Timing',
    summary: 'useTimer countdowns, fixed-duration pages, and awaitable sleeps.',
    component: () => import('./TimingExample.vue'),
  },
  configuration: {
    title: 'Configuration',
    summary: 'Between-subject conditions feeding params, with subtree and per-instance overrides.',
    component: () => import('./ConfigurationExample.vue'),
  },
  surveys: {
    title: 'Surveys',
    summary: 'Survey epochs in an ESurveyWrapper and a project-declared data view.',
    component: () => import('./SurveysExample.vue'),
  },
  instructions: {
    title: 'Instructions',
    summary: 'ENavigableSequence pages, gating Next until each page is completed.',
    component: () => import('./InstructionsExample.vue'),
  },
  'mouse-tracking': {
    title: 'Mouse tracking',
    summary: 'Per-trial mouse trajectories with the MouseTracker component.',
    component: () => import('./MouseTrackingExample.vue'),
  },
}

export const exampleSlugs = Object.keys(examples)

export const resolveExampleComponent = (entry: ExampleEntry) => defineAsyncComponent(entry.component)
