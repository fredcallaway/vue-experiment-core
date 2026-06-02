# Proposed New Demos

> **Status (implemented).** All six demos below have since been built and registered in `manifest.ts`: `custom-epoch`, `responses`, `data`, `params`, `surveys`, and `timing`. This doc is retained as the design rationale.

The `/demo` section previously covered only the structural core: **basics** (epochs, `ESequence`, `ERepeat`), **devtools**, **instructions** (`ENavigableSequence`), and **phases**. These teach how to *compose* epochs, but several features a developer reaches for when building a real task had no runnable, commented reference. This doc proposed demos to fill those gaps.

Each demo follows the existing conventions: a self-contained component under `internal/demos/`, registered in `manifest.ts` with a slug, title, and one-line summary; the epoch tree lives in the component (not the page) so component-level HMR preserves running state; prose-as-documentation in the template with mechanics explained in comments.

## Priority demos

These cover features used in essentially every experiment and have no current coverage.

### 1. `custom-epoch` — Writing your own epoch component

**Gap.** The basics demo shows composing built-in epochs, and phases shows `usePhaseEpoch`, but nothing demonstrates authoring a *new leaf epoch* from scratch: declaring the epoch with `useEpoch`/`usePhaseEpoch`, defining typed parameters with `defineParams`, logging events, exposing a data view, and ending the epoch with `done()`. This is the single most important thing a developer does when the built-ins aren't enough, and `EClickTest` is currently the only example — but it's large (~200 lines) and mixes in timers, animation, scoring, and a board layout, so it's hard to read as a *first* custom epoch.

**Proposal.** A minimal custom epoch — a simple two-alternative forced-choice trial — that shows the full anatomy with nothing extra:

```vue
<script lang="ts">
// Parameters: typed, overridable via the `params` prop.
export const [provideChoiceParams, useChoiceParams] = defineParams({
  promptMs: 500,
})

// One logged event per response, with a typed payload.
const [logChoice, isChoice] = declareEventLogger<{ choice: string; rt: number }>('choice.made')

// A data view turns logged events into one row per trial for export.
declareDataView('choice', (session: SessionData) => {
  return session.events.filter(isChoice).map(e => e.data)
})
</script>

<script lang="ts" setup>
const props = defineProps<{ params?: Partial<ReturnType<typeof useChoiceParams>> }>()
const params = useChoiceParams(props.params)

// Declare the epoch BEFORE composables that depend on epoch context.
const epoch = useEpoch('choice')
const start = performance.now()

const onChoice = (choice: string) => {
  logChoice({ choice, rt: performance.now() - start })
  epoch.done() // ends this epoch; control returns to the parent
}
</script>

<template>
  <div flex-col flex-center gap-4>
    <div text-xl>Pick one</div>
    <PButtons values="left right" @click="onChoice" />
  </div>
</template>
```

The demo page would wrap this in an `ERepeat` so the reader sees independent per-trial epochs and the resulting data view, then point to `EClickTest` as the "everything together" example (timers, phases, animation, bonus). The key teaching points: declaring the epoch first, the params/event/data-view trio, and `done()` as the contract that returns control to the parent.

### 2. `data` — Events, data views, and exports

**Gap.** Logging is mentioned in passing (basics, the custom-epoch proposal) but there's no demo dedicated to the data pipeline: `declareEventLogger` → logged events → `declareDataView` → the wide/long export shape. Since the simplified branch deliberately removed automatic `participant.*` logging in favor of explicit semantic logs (see `CHANGES.md`), developers now *must* understand this pipeline, and there's no reference for it.

**Proposal.** A small interactive trial that logs a couple of typed events, with the live event stream and the resulting data-view rows shown side by side on the page. Cover: typed payloads, the `isX` type guard for filtering, `chunkBy` for grouping events into trials, and the difference between the raw event log and the export view. This pairs naturally with the custom-epoch demo and can reuse its event shape.

### 3. `params` — Parameters and conditions

**Gap.** `defineParams` and `useConditions` are core to making a configurable, counterbalanced experiment, and the condition inspector was added on this branch (`CHANGES.md`), but neither has a demo. Parameter overrides via the `params` prop and condition pinning from the dev UI are exactly the things a developer needs to test variants.

**Proposal.** A demo that defines a parameter set, renders the same epoch twice with different `params` overrides to show they're independent, and registers a condition with `useConditions().choice(...)` / `.permute(...)` so the reader can open the dev UI, see it in the condition inspector, and pin it. Explain the `condition.<key>` URL params and how pinning interacts with the assignment counter.

### 4. `responses` — Collecting participant input

**Gap.** Response collection is used in essentially every trial, but the components and helpers that do it (`PButton`, `PButtons`, `PContinue`, `usePButton`, `PKey`, `onKeyPress`, `promiseKeyPress`) are never explained as a group. The only keyboard example is a single page buried in the instructions flow, and the simplified branch's removal of `useParticipant` (`CHANGES.md`) means the current response model — including how to gate input during transitions — has no reference. This merges the previously separate "keyboard" and "affordances" proposals into one high-priority demo, since in practice mouse and keyboard responses are two sides of the same concern.

**Proposal.** A demo that covers both response modalities and both usage styles:

- **Buttons (declarative):** `<PButton @click>` and `<PButtons values="left right" @click>`, including `:disabled` gating and the `once` prop.
- **Buttons (script-side):** `usePButton().promise('click')` — awaiting a typed button event from script while the template renders the button, as `EClickTest`'s start button does.
- **Keys (component):** `<PKey keys="F J" @press>` exposing the `{ key, rt }` payload with reaction time.
- **Keys (script-side):** `promiseKeyPress('F J')` for awaiting a response, and `onKeyPress(...)` for a persistent listener (auto-unsubscribed on unmount).
- **`PContinue`:** how it advances its parent epoch (button or space-key affordance).
- **Gating during transitions:** the post-`useParticipant` pattern of guarding handlers with an `animating`/phase flag and `:disabled`, since the template no longer blocks input automatically.

## Secondary demos

Useful but narrower; worth adding once the priority set lands.

### 5. `surveys` — Survey epochs

**Gap.** `ESurveyWrapper`, `ESurveyButtons`, `ESurveyMultiButtons`, and `ESurveyText` replaced `ESurveySequence` on this branch and projects must now declare their own survey data views (`CHANGES.md`), but there's no demo. A worked example of a short survey plus the data view that extracts responses would save every project from rediscovering the pattern.

### 6. `timing` — Timers and fixed-duration pages

**Gap.** `useTimer`, `EPage :duration`, and `useLocalAsync().sleep` are the timing primitives (the latter two added/changed on this branch) with no dedicated example. A demo with a countdown timer, an auto-advancing fixed-duration feedback page, and an awaited delay would cover the common timing needs in one place.

## Suggested ordering

The demo index currently reads top-to-bottom as a learning path. Proposed insertion: **basics → custom-epoch → responses → data → params → phases → instructions → surveys → timing → devtools**, so a reader moves from composing built-ins, to authoring their own epoch and collecting input, to the data and configuration concerns, before the more specialized components.

## Not proposed (out of scope)

Per the `simplified` branch scope, demos for Prolific, the data page, Firebase/PostHog config, and the database structure are intentionally omitted. Browser-monitoring composables (`useBrowserMonitoring`, `useInactivityTracker`, `useMultipleTabDetection`) are likewise infrastructure rather than authoring patterns and don't warrant tutorials unless a project need arises.
