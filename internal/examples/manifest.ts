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
  sequences: {
    title: 'Sequences',
    summary: 'Composing structure from EContinue, ESequence, and ERepeat.',
    component: () => import('./SequencesExample.vue'),
  },
  experiment: {
    title: 'Full experiment',
    summary: 'A short end-to-end study: consent, instructions, trials, survey, completion.',
    component: () => import('./ExperimentExample.vue'),
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
  data: {
    title: 'Data',
    summary: 'Typed events -> data view -> export rows, grouped per trial with chunkBy.',
    component: () => import('./DataExample.vue'),
  },
  params: {
    title: 'Params',
    summary: 'defineParams defaults, subtree provides, and per-instance overrides.',
    component: () => import('./ParamsExample.vue'),
  },
  conditions: {
    title: 'Conditions',
    summary: 'Between-subject assignment with useConditions (and dev-UI pinning).',
    component: () => import('./ConditionsExample.vue'),
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
  'instructions-embedded': {
    title: 'Interactive instructions: embedded practice',
    summary: 'Teach the task by embedding it as a short unscored practice block.',
    component: () => import('./InstructionsEmbeddedExample.vue'),
  },
  'instructions-hooks': {
    title: 'Interactive instructions: hooks',
    summary: 'Narrate a live task, pausing and rigging it through defineHook hooks.',
    component: () => import('./InstructionsHooksExample.vue'),
  },
  'instructions-ref': {
    title: 'Interactive instructions: template ref',
    summary: 'Drive the task imperatively from instruction pages via an exposed method.',
    component: () => import('./InstructionsRefExample.vue'),
  },
  bonus: {
    title: 'Bonus',
    summary: 'useBonus: points, formatted display, and the end-of-study reveal.',
    component: () => import('./BonusExample.vue'),
  },
  'mouse-tracking': {
    title: 'Mouse tracking',
    summary: 'Per-trial mouse trajectories with the MouseTracker component.',
    component: () => import('./MouseTrackingExample.vue'),
  },
}

export const exampleSlugs = Object.keys(examples)

export const resolveExampleComponent = (entry: ExampleEntry) => defineAsyncComponent(entry.component)
