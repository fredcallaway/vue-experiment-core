import type { Component } from 'vue'
import BasicsDemo from './BasicsDemo.vue'
import DevtoolsDemo from './DevtoolsDemo.vue'
import InstructionsDemo from './InstructionsDemo.vue'
import PhasesDemo from './PhasesDemo.vue'

// Registry of demo tutorials, keyed by URL slug (/demo/<slug>). The [slug] page renders the
// matching component, and the index lists them. Each demo's epoch tree lives in its component
// (not the page) so editing it triggers component-level HMR, which preserves the running epoch
// state and the outline; a page edit would tear the tree down and reset it to __TOP_EPOCH__.

export type DemoEntry = {
  component: Component
  // Minimum window size enforced while the demo runs (defaults to 800x600 when omitted).
  windowSize?: { width: number; height: number }
}

export const demos: Record<string, DemoEntry> = {
  basics: { component: BasicsDemo, windowSize: { width: 600, height: 800 } },
  devtools: { component: DevtoolsDemo },
  instructions: { component: InstructionsDemo },
  phases: { component: PhasesDemo },
}

export const demoSlugs = Object.keys(demos)
