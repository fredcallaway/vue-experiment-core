# Examples index

Agent-facing index of the template's reference implementations. Each example in this
directory is a live, minimal, type-checked component mounted at `/examples/<slug>`
(registered in `manifest.ts`). When implementing a feature, find the matching example
below and copy its patterns — they encode the template's current conventions. Human-facing
concept docs are at `/docs` (source: `core/internal/docs/`).

Read [`docs/guide/README.md`](../../docs/guide/README.md) first for the project-wide rules. This file is the routing table for their canonical implementations.

## Examples by task

Structure:

- `StudyExample.vue` + `PeekGame.vue` + `PeekGameInstructions.vue` (`/examples/study`) —
  **the complete pattern**: interactive instructions (scripted demonstration rounds,
  embedded practice, comprehension quiz), conditions feeding params, two-level block
  structure (blocks × trials as data, per-trial rigs) with a persistent header, typed
  events + data view, survey, bonus reveal, completion. Start here when building a whole
  experiment.

Trials:

- `TrialExample.vue` + `StroopTrial.vue` (`/examples/trial`) — **the canonical custom
  trial**: params, typed events, data view, phase flow, `done()`. Start here for any new
  phase-based trial component.
- `PhasesExample.vue` (`/examples/phases`) — `usePhaseEpoch` + `useDisplayPhases`:
  one epoch, several visual states sharing component state; `<Phase>` modifiers
  (`constant`/`persist`/`static`), `next`/`goTo`/`done`.
- `PeekGame.vue` (part of `/examples/study`) — the canonical async-loop trial: an async
  main loop in `onMounted` that awaits task actions and sleeps rather than using a phase
  state machine.

Input:

- `ResponsesExample.vue` (`/examples/responses`) — buttons (`PButton`/`PButtons`,
  `usePButton().promise`), keys (`PKey`, `promiseKeyPress`, `onKeyPress`), input gating.

Timing:

- `TimingExample.vue` (`/examples/timing`) — `useTimer`, `<EPage :duration>`,
  `useLocalAsync().sleep`.

Data:

- The pipeline (`declareEventLogger` → typed events → `declareDataView`) is part of the
  canonical trial: see `StroopTrial.vue`. To group several events per trial into one row,
  filter with the loggers' type guards and chunk with `chunkBy(events, isOnset)` — snippet
  in the data section of `/docs` (`core/internal/docs/DocsData.vue`).

Configuration:

- `ConfigurationExample.vue` + `ProbeTrial.vue` (`/examples/configuration`) —
  between-subject assignment with `useConditions().assign`, dev-UI pinning via
  `condition.<key>` URL params, and assigned values feeding `defineParams` subtree
  defaults with per-instance `:params` overrides.

Instructions:

- `InstructionsExample.vue` (`/examples/instructions`) — `ENavigableSequence` with
  `enableNext` gating; per-page `state` scratch object. Use for read-and-page
  instructions with no live task (participants can re-read).
- `PeekGameInstructions.vue` (part of `/examples/study`) — **the interactive-instructions
  pattern** for scripted demonstrations, rigged rounds, embedded practice, and a
  comprehension quiz. The task defines an instructable surface with `defineExpose`
  (async round methods with rig arguments, reactive state, and input flags) and is
  mounted once, `manual no-epoch`; each page scripts it in `@mounted`. Use a plain
  `ESequence` for pages that drive the task because back-navigation would rerun their
  scripts; reserve `ENavigableSequence` for read-only pages.

Other:

- `MouseTrackingExample.vue` (`/examples/mouse-tracking`) — `<MouseTracker />` per trial
  epoch; saved to the session's `other/mouse` data.
- `SurveysExample.vue` (`/examples/surveys`) — `ESurveyWrapper` + `ESurveyButtons` /
  `ESurveyMultiButtons` / `ESurveyText`; project-declared survey data view.

## Not covered by examples

- **Devtools** (`/dev`): epoch outline (click to jump), pinning, fast mode, Events /
  DataView / Conditions / Inspector panels (`useInspect({ ... })` to add values), error
  boundary. See `/docs#devtools`.
- **Window size**: call `defineWindowSize({ width, height })` once, at the top of
  `Experiment.vue`.
- **Other core epochs**: `EClickTest` (a motor/attention check block, see
  `core/components/epochs/EClickTest.vue`), `EConnectionCheck`, and the
  consent/no-return/completion epochs shown in the study example.
- **Prolific / deployment / data dashboard**: template-managed; do not modify from
  project code.
