# ADR 0001: Phase epochs create real child epochs per phase

- **Status:** Accepted (implemented)
- **Date:** 2026-06-01
- **Scope:** `core/` template layer, `simplified` branch
- **Commits:** `core` d422750; outer repo bump 797ecf6
- **Affected files:** `core/composables/useEpoch.ts`, `core/internal/composables/useEpochTree.ts`, `core/CHANGES.md`

## Context

The discussion started from a comment in the sequence demo ("This pattern allows us
to have some content that is stable while…"). Pulling on that thread surfaced a
broader question about the **pseudo-leaf** mechanism in the epoch system.

### The pseudo-leaf mechanism

`useIndexableEpoch` (used by `ESequence`, `ERepeat`, and `usePhaseEpoch`) ran a
`watchImmediate(step, …)` that, whenever a step became active *without* a real
child epoch mounting for it, synthesized a placeholder epoch named `leaf_<step>`
(or `leaf_<phase>`). This synthetic epoch was marked `isPseudoLeaf` and special-cased
in several places (jump-path skipping, outline clone-renaming, outline traversal).

Investigation showed the mechanism was doing **two distinct jobs**:

- **Job A — covering for bare presentational leaves in a sequence.** A bare
  `<PContinue>` as a direct child of `ESequence` has no epoch of its own
  (`PContinue` is presentational; it injects its parent and calls `next()`), so the
  pseudo-leaf fabricated one. This case is **vestigial**: the real experiment
  (`components/Experiment.vue`) and the current demos already wrap such content in
  `EPage`. Nothing real depends on it.

- **Job B — giving each phase of a `PhaseEpoch` a place in the epoch tree.** Phases
  (e.g. `start`/`play`/`feedback` in `EClickTest`) are intentionally *not* separate
  epoch components — they share one component's state and animate in place. The
  pseudo-leaf was what made each phase appear in the outline, be logged
  (`epoch.start`), and be jumpable. This case is **legitimate and load-bearing**.

Conflating the two in one general fallback ("sometimes we fabricate an epoch,
depending on mount timing") was the actual source of confusion. The code even
carried `TODO`s admitting the authors weren't sure when it fired.

## Decision

Make **phase children real epochs**, created explicitly by `usePhaseEpoch`, and stop
relying on the pseudo-leaf for phases (Job B). The vestigial sequence fallback
(Job A) was left in place for now — it is a separate, deferred change.

Design constraints set during discussion:

1. **No `EPhase` component.** Authors keep writing `usePhaseEpoch` + `<Phase>`; the
   child epoch is created internally.
2. **No watcher.** Phase-child creation happens directly in `goTo` (and once at init
   for the first phase), because it does not depend on anything else
   (not) happening — it is a direct consequence of the phase changing.
3. **Mounted epochs attach to the phase child.** An `EPage` (or `PContinue`) inside
   an active `<Phase>` becomes a child of that phase's epoch.
4. **Loop handling in traversal: do not throw.** If the outline traversal revisits a
   phase (a possible loop), call `done()` on the parent phase epoch rather than
   erroring.

### Naming

"Leaf" was wrong (a phase child may itself have children); "phase epoch" already
names the parent. The per-phase child is simply named after its phase, yielding ids
like `…[<phase>]-<phase>` (e.g. `clicktest[play]-play`).

## Implementation

- **`useIndexableEpoch`** gained an `autoLeaf` option (default `true`). The pseudo-leaf
  watcher only runs when `autoLeaf` is set. `ESequence`/`ERepeat` keep the old
  behavior; the `leaf_<step>` name no longer has a phase branch.

- **`usePhaseEpoch`** opts out (`autoLeaf: false`) and manages its own children:
  - `enterPhaseChild()` disables the previous phase child (so ending it does not
    advance the parent — the phase change itself is the navigation), creates a new
    `makeEpoch({ name: phase, parent: E })`, sets it current, and logs `epoch.start`.
  - `goTo` calls `enterPhaseChild()` after updating the step; `next`/`prev` route
    through `goTo` (they previously mutated `step` directly and would have bypassed
    child creation); the first phase's child is created once at init.
  - `done` is wrapped to disable the active phase child before delegating.
  - `E.phaseEpoch: Ref<Epoch | null>` exposes the currently-active child.

- **`injectParentEpoch`** resolves a phase epoch to its active phase child. This is
  what makes mounted epochs/affordances attach to the phase's child. (An earlier
  attempt to `provide` from `<Phase>` was discarded: Vue resolves injection for slot
  content against the slot's *owner*, not the component rendering the slot, so a
  `provide` inside `<Phase>` would not reach slotted `<EPage>`s.)

- **Outline traversal** (`useEpochTree.ts`) tracks visited leaf ids; on revisiting a
  leaf it calls `epoch._parent.done()` instead of advancing again, ending a looping
  phase epoch.

## Consequences

- Phases are now ordinary epochs: real ids, real `epoch.start` logging, real
  lifecycle, and directly jump-addressable (previously the `leaf_` segment was
  skipped in jump paths).
- **Breaking for saved data / jump targets:** the per-phase id changed from
  `…[<phase>]-leaf_<phase>` to `…[<phase>]-<phase>`. Documented in `CHANGES.md`.
- `constant`/`persist` phases that stay mounted across phase changes are display-only
  overlays and are not intended to host epochs; injection resolves to whichever phase
  child is active at injection time.

## Deferred / not done

- **Job A (sequence bare-leaf fallback).** The `leaf_<step>` pseudo-leaf path for
  `ESequence`/`ERepeat` remains. A future change could require epoch-only children
  there and remove it. The `sequence.vue` / `BasicsDemo.vue` comments about non-epoch
  children describe this still-present behavior and were left unchanged.
- **`ESwitch` generalization.** We discussed whether "phase" is the right concept or
  whether it should be a more general `ESwitch` (e.g. condition-dependent control
  flow). Deferred; this change does not foreclose it.
- **Forward-only traversal enforcement.** The loop risk is handled pragmatically
  (end parent on revisit) rather than by enforcing strictly-forward navigation.

## Verification

- `bun run typecheck` clean.
- Control flow reasoned through for `EClickTest` and `PhasesDemo` (including the
  `apple` phase that nests an `ESequence`).
- Browser testing of jumping/traversal was explicitly deferred ("we can test this
  when the time comes").
