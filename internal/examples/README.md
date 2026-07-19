# Examples index

Agent-facing index of the template's reference implementations. Each example in this
directory is a live, minimal, type-checked component mounted at `/examples/<slug>`
(registered in `manifest.ts`). When implementing a feature, find the matching example
below and copy its patterns — they encode the template's current conventions. Human-facing
concept docs are at `/docs` (source: `core/internal/docs/`).

## Core rules

These apply to all experiment code:

- **The epoch model.** An experiment is a tree of *epochs* (periods of time). Branch
  epochs (`ESequence`, `ERepeat`) compose; leaf epochs (`EContinue`, `EPage`, custom
  components) run one at a time. A leaf ends itself by calling `done()`, which hands
  control back to its parent.
- **Composition rules.** Every direct child of an `ESequence`/`ERepeat` must be an epoch
  component, and an epoch component must sit inside an epoch. Presentational markup may
  surround the epochs inside a branch (it stays mounted across steps). Violations throw
  informative errors.
- **A trial is a component.** Anything beyond "show this, then continue" is a custom
  component: module-level `defineParams` + `declareEventLogger` + `declareDataView`,
  per-instance `useEpoch`/`usePhaseEpoch` and control flow. See `StroopTrial.vue`.
- **Call `useEpoch(...)` before composables that depend on epoch context.** Epoch names
  must not contain hyphens.
- **Log semantic events explicitly** with declared (typed) loggers. Automatic
  `participant.*` events are for debugging, not your data record.
- **Use `useLocalAsync()`'s `sleep`/`registerAsync`** (never bare `setTimeout`) in epoch
  logic, so pending delays can't fire into an unmounted component.
- **Gate input yourself** during transitions (an `animating`/phase flag + `:disabled`);
  the template does not block input.
- **Randomize data, not control flow**: build and shuffle a trial array up front
  (`random.shuffle`), index it with `ERepeat`'s `step`. Static stimuli are plain imports
  from `~/assets/*.json`. To branch structure on a condition, use ordinary `v-if`/order
  logic around epochs; the assignment comes from `useConditions`.
- **Naming**: `E*` = epoch components, `P*` = participant-input components. Project code
  lives at the project root (`components/Experiment.vue` etc.), not in `core/`.

Run `bun run typecheck` after edits.

## Examples by task

Structure:

- `SequencesExample.vue` (`/examples/sequences`) — compose screens/blocks with
  `EContinue`, `ESequence`, `ERepeat`; nesting; terminal page.
- `ExperimentExample.vue` (`/examples/experiment`) — the full-study skeleton: `EConsent`,
  instructions, `ENoReturn`, trial block with persistent header, survey, `ECompletion`.
  Mirror of a real `components/Experiment.vue`.
- `StudyExample.vue` + `PeekGame.vue` + `PeekGameInstructions.vue` (`/examples/study`) —
  **the complete pattern**: interactive instructions (scripted demonstration rounds,
  embedded practice, comprehension quiz), conditions feeding params, two-level block
  structure (blocks × trials as data, per-trial rigs) with a persistent header, typed
  events + data view, survey, bonus reveal, completion. Start here when building a whole
  experiment.

Trials:

- `TrialExample.vue` + `StroopTrial.vue` (`/examples/trial`) — **the canonical custom
  trial**: params, typed events, data view, phase flow, `done()`. Start here for any new
  trial component. `ColorTrial.vue` is a smaller variant used by the experiment example.
- `PhasesExample.vue` (`/examples/phases`) — `usePhaseEpoch` + `useDisplayPhases`:
  one epoch, several visual states sharing component state; `<Phase>` modifiers
  (`constant`/`persist`/`static`), `next`/`goTo`/`done`.
- `CoinGame.vue` — a loop-driven task: an async main loop in `onMounted` that awaits
  key presses and sleeps, rather than a phase state machine. Also the host task for the
  interactive-instruction examples below.

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

- `ParamsExample.vue` + `ProbeTrial.vue` (`/examples/params`) — `defineParams`
  defaults, subtree-wide `provideXParams()`, per-instance `:params` overrides.
- `ConditionsExample.vue` (`/examples/conditions`) — `useConditions().choice/permute`
  between-subject assignment; dev-UI pinning via `condition.<key>` URL params.

Instructions:

- `InstructionsExample.vue` (`/examples/instructions`) — `ENavigableSequence` with
  `enableNext` gating; per-page `state` scratch object. Use for read-and-page
  instructions with no live task (participants can re-read).
- Interactive instructions (the participant interacts with the real task while learning
  it). Decision rule:
  - If playing a round or two unassisted teaches the task → embed it as a short unscored
    practice block: `InstructionsEmbeddedExample.vue` (`/examples/instructions-embedded`).
  - Anything more (scripted demonstrations, rigged rounds, reacting to what the
    participant does) → **the exposed-surface pattern**: `PeekGameInstructions.vue`
    (part of `/examples/study`). The task defines an "instructable surface"
    (`defineExpose`: async round methods with rig arguments, reactive state, input
    flags) and is mounted once, `manual no-epoch`; each page scripts it in `@mounted`
    (await methods, `until()` on exposed state). Combine with embedded practice epochs
    and a comprehension quiz. Use a plain `ESequence` for pages that drive the task
    (back-navigation would re-run their scripts); `ENavigableSequence` only for
    read-only pages.
  - `InstructionsHooksExample.vue` (`/examples/instructions-hooks`) — `defineHook`
    synchronization for a task that must run its own epoch-driven loop while
    instructions observe/pause it. Rarely needed; prefer the exposed-surface pattern.
  - `InstructionsRefExample.vue` (`/examples/instructions-ref`) — minimal form of the
    exposed-surface pattern on `CoinGame.vue`.

Other:

- `BonusExample.vue` (`/examples/bonus`) — `useBonus`: `centsPerPoint`, `addPoints`,
  formatted display, end-of-study reveal.
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
  consent/no-return/completion epochs shown in the experiment example.
- **Prolific / deployment / data dashboard**: template-managed; do not modify from
  project code.
