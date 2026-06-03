# ADR 0004: Automated end-to-end testing for experiments

- **Status:** Proposed (no decision)
- **Date:** 2026-06-02
- **Scope:** `core/` template layer + project root, `simplified` branch
- **Related:** [0003-offscreen-outline-traversal.md](./0003-offscreen-outline-traversal.md)
- **Relevant files:** `core/internal/composables/useEpochTree.ts` (`traverseTimeline`),
  `core/internal/components/OutlineWorkerFrame.vue`, `core/internal/components/OutlineWorkerDriver.vue`,
  `core/composables/useEpoch.ts`, `core/pages/dev.vue`, `core/composables/fastMode.ts`,
  `core/composables/useDataWriter.ts`, `core/composables/logEvent.ts`, `components/Experiment.vue`

## Context

The template has **no automated tests**, and neither do the four reference projects. The only way
to verify an experiment runs end-to-end is to launch `bun run dev`, open `/dev`, and click through
by hand.

An earlier draft of this ADR proposed hand-authored Playwright specs plus `data-testid`/`data-epoch`
hooks on components. That direction was rejected: **the spec is just the manual click-through
rewritten in TypeScript.** It enumerates every page, so any non-trivial timeline edit — reordering
pages, adding a trial phase, changing a prompt — breaks it, and the hooks add boilerplate to every
component for little payoff. We want something **structurally robust and substantially more
automated**: a test that drives itself through whatever timeline the experiment defines, without the
author describing each step.

## Key realization: the engine can already drive itself

The template **already contains a structure-agnostic timeline auto-driver**, and it is battle-tested
in production because it powers the dev "Epochs" outline panel.

`traverseTimeline` (`useEpochTree.ts:452`) discovers the experiment's structure by *actually
running it*: it watches `currentEpoch` and, at each epoch, calls the engine's own
`epoch.done()` / `epoch.goTo()` to advance, walking from the start all the way to `__TOP_EPOCH__`.
It needs **no knowledge of the specific pages** — no selectors, no text, no per-component hooks. It
already handles the hard cases:

- **Loops** (`ERepeat`, phase epochs): a `visited` set ends a looping parent instead of spinning
  forever, and `hasIdenticalChildren` skips redundant repeats (`useEpochTree.ts:497–509`).
- **Branches** (`useCondition`): it follows whichever branch the live experiment actually mounts.
- **Position restore**: it remembers where it started and jumps back when done.

There is also an established pattern for running an experiment **headlessly to completion off the
participant's tab**: the outline worker. A hidden iframe loads the same route with `?outlineWorker=1`
(`OUTLINE_WORKER_FLAG`), and `OutlineWorkerDriver.vue` kicks off a full traversal in that frame,
broadcasting the result over a `BroadcastChannel` (ADR 0003). This is exactly the shape of a headless
"run the whole experiment" harness — it already exists, just aimed at outline-building rather than
testing.

So the automated test we want is mostly **a matter of pointing existing machinery at a new goal.**

## What this buys us, and the one real caveat

A traversal-based test asserts the property that actually matters and that hand-testing checks:
*given this timeline, can a participant get from the first epoch to completion without the engine
throwing or getting stuck?* It survives timeline edits by construction, because it reads the
structure at runtime instead of hard-coding it.

The caveat, which the proposal must be honest about: `traverseTimeline` advances epochs by calling
`done()`/`goTo()` directly and runs with the **DataWriter disabled**
(`useDataWriter().withDisabled(doTraversal)`). So by itself it validates **structure and
reachability**, not the real interaction path (a participant clicking a `PButton`, pressing a
`PKey`) or the data-logging that those interactions drive. The proposal's job is to keep the
self-driving robustness while recovering as much of the real path and data signal as is worthwhile.

## Options considered

### A. Reachability check via `traverseTimeline` (cheapest, most robust)

A Playwright spec loads `/dev?fast`, invokes the existing traversal (exposed via a thin dev-only
bridge, e.g. `window.__epoch.traverse()`), and asserts it reaches `__TOP_EPOCH__` with no epoch
errors recorded (`errorsById` is already populated during traversal).

- **Pros:** Near-zero authoring cost — *the same spec works for every experiment with no edits*.
  Maximally robust to timeline changes. Reuses code that already ships and is exercised constantly.
- **Cons:** Bypasses real affordances and logging (the caveat above). It proves the timeline is
  *traversable*, not that a human-style interaction sequence produces the right *data*.

### B. Self-driving via real affordances (robust + real interaction)

Generalize the auto-driver so that, instead of calling `epoch.done()`, it advances by triggering
the **actual affordance** the current leaf exposes — click the (single, or each) `PButton`, press
the registered `PKey`, hit space for a `PContinue`. The driver still reads what to do from the live
component rather than from a script, so it stays structure-agnostic, but now it exercises the real
input and data-logging paths with the DataWriter **enabled**. Completion and event-count assertions
then check the data contract.

- **Pros:** Keeps the self-driving robustness *and* tests the real participant/data path. One driver,
  authored once in `core/`, serves every experiment.
- **Cons:** New code in `core/` (a "test driver" sibling to `traverseTimeline`). Ambiguous leaves
  (multiple buttons, free-text survey input) need a resolution policy — pick first / pick random
  with a seeded RNG, with an optional per-component hint when the default is wrong. This is the
  bulk of the design work.

### C. Hand-authored Playwright specs + test hooks (rejected)

The earlier draft. Enumerate pages with text/role or `data-testid` selectors.

- **Cons:** Brittle to every timeline edit, per-component hook boilerplate, authoring cost scales
  with experiment size. This is the thing the user explicitly ruled out.

### D. Vitest component/unit tests (rejected as primary)

Epoch components need live epoch context, timers, and the data writer; isolating them mostly tests
mocks. Reasonable later for pure helpers (`preprocessing.ts`, data-view transforms), not for the
timeline-completion question.

## Recommendation

Adopt **B as the goal, with A as the immediate, near-free first step** — they share the same
self-driving core and the same headless-run plumbing (`/dev?fast`, the outline-worker pattern), so
A is a stepping stone, not throwaway work.

1. **Ship A now.** Add `@playwright/test` + a `playwright.config.ts` (`webServer: bun run dev`), a
   dev-only `window.__epoch` bridge exposing `traverse()` and `errors()`, and one template spec
   that traverses `/dev?fast` (and the `/demo/*` pages) and asserts zero epoch errors + reached
   top. This single spec is the regression signal for `core/` changes during migration and works
   for any project unmodified.

2. **Then build B in `core/`.** A `driveExperiment()` routine modeled on `traverseTimeline` but
   advancing through real affordances with the DataWriter live. Leaf-resolution policy: default to
   the first/only affordance; seeded-random when several; allow an opt-in hint
   (e.g. an attribute or a registered resolver) only where the default is wrong — *opt-in, not the
   per-component boilerplate of option C*. The spec then asserts on logged events
   (`useDataWriter().events`) — e.g. "every trial logged a choice," "`experiment.complete` fired."

3. Add a `test` script to `package.json` and document the model in `AGENTS.md`: authors get the
   reachability test for free; they only write assertions for the *specific data* their experiment
   must produce, never the navigation.

### Why this scope

It inverts the cost curve of option C. Authoring effort no longer scales with the number of pages —
the driver reads the timeline at runtime — so the test stays green across the reorderings, inserts,
and copy edits that experimenters make constantly, and only breaks when the experiment genuinely
can't be completed or stops producing the data it promises.

## What a test would look like

### Option A — reachability (works for any experiment, no per-page code)

```ts
// core/tests/reachable.spec.ts
import { test, expect } from '@playwright/test'

test('experiment is traversable to completion with no epoch errors', async ({ page }) => {
  await page.goto('/dev?fast')                       // debug mode, durations collapsed
  await page.waitForFunction(() => !!window.__epoch)  // dev-only bridge

  // Reuse the engine's own self-driving walker (the one that builds the outline panel).
  const result = await page.evaluate(() => window.__epoch.traverse())

  expect(result.reachedTop).toBe(true)
  expect(result.errors).toEqual([])   // errorsById captured during traversal
})
```

There is no per-page code here, and there is none to update when the timeline changes. The same
file is the smoke test for `Experiment.vue` and for every reference project.

### Option B — self-driving through real affordances + data assertions

```ts
// core/tests/runthrough.spec.ts
test('a full run logs the expected data and completes', async ({ page }) => {
  await page.goto('/dev?fast')
  await page.waitForFunction(() => !!window.__epoch)

  // driveExperiment advances by triggering each leaf's real affordance (click PButton,
  // press PKey, space for PContinue) with the DataWriter live — still reading *what* to do
  // from the live component, so no page is hard-coded. Seeded RNG resolves ambiguous leaves.
  const events = await page.evaluate(() => window.__epoch.driveExperiment({ seed: 1 }))

  const names = events.map(e => e.name)
  expect(names).toContain('experiment.begin')
  expect(names).toContain('experiment.complete')
  // Data contract, not DOM prose: one choice logged per trial, however many trials there are.
  const trials = names.filter(n => n === 'trial.choice').length
  expect(trials).toBeGreaterThan(0)
})
```

The author writes only the bottom assertions — the *data their experiment must produce*. The
navigation is supplied by the shared driver. Event names (`trial.choice`, `experiment.complete`),
the bridge surface, and the leaf-resolution policy are placeholders to pin down in implementation.

## Open questions

- **How much of B is feasible cleanly?** Triggering the "real" affordance generically means the
  driver must find, per leaf, the active `PButton`/`PKey`/`PContinue` and invoke it. Is a registry
  of active affordances (a lightweight version of what `usePButton`/the event controllers already
  track) cleaner than DOM-poking from the driver? This is the crux of the design.
- **Ambiguity policy:** first vs. seeded-random vs. exhaustive (drive every branch). Seeded-random
  with a fixed seed gives reproducibility and decent coverage cheaply; exhaustive is a later option.
- **Data backend in tests:** the in-memory `useDataWriter().events` is enough for assertions; we do
  not need Firebase/PostHog emulation. Confirm B can run with the writer "live" but the *remote*
  sink stubbed (mode `debug`/`dummy`) so no network is required.
- **Worker reuse:** should the headless run reuse the `?outlineWorker=1` iframe pattern, or is a
  top-level `/dev` tab sufficient for tests? The worker pattern exists to avoid disrupting a real
  participant; in a test tab there is no participant to disrupt, so the simpler top-level run likely
  suffices.
- **CI:** headless Playwright in GitHub Actions, or a local pre-deploy gate slotted into the
  existing clean-worktree deploy check?
