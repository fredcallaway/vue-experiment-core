# ADR 0001: Remove the pseudo-leaf mechanism

- **Status:** Accepted (implemented)
- **Date:** 2026-06-01
- **Scope:** `core/` template layer, `simplified` branch
- **Affected files:** `core/composables/useEpoch.ts`, `core/internal/composables/useEpochTree.ts`, `core/CHANGES.md`

## Context

`useIndexableEpoch` (used by `ESequence`, `ERepeat`, and `usePhaseEpoch`) ran a
`watchImmediate(step, …)` that, whenever a step became active *without* a real child
epoch mounting for it, synthesized a placeholder epoch named `leaf_<step>` (or
`leaf_<phase>`). This synthetic epoch was marked `isPseudoLeaf` and special-cased in
several places (jump-path skipping, outline clone-renaming, outline traversal).

The mechanism conflated **two distinct jobs**:

- **Job A — covering for bare presentational leaves in a sequence.** A bare
  `<PContinue>` as a direct child of `ESequence` has no epoch of its own (`PContinue`
  is presentational; it injects its parent and calls `next()`), so the pseudo-leaf
  fabricated one. This case is **vestigial**: the real experiment and the current demos
  already wrap such content in `EPage`. Nothing real depends on it.

- **Job B — giving each phase of a `PhaseEpoch` a place in the epoch tree.** Phases
  (e.g. `start`/`play`/`feedback` in `EClickTest`) are intentionally *not* separate
  epoch components — they share one component's state and animate in place. The
  pseudo-leaf was what made each phase appear in the outline, be logged
  (`epoch.start`), be jumpable, and — critically — be *advanced during outline
  traversal* (the traversal only calls `done()` on epochs that lack a `step`; a phase
  epoch has `step`, so without a step-less child the traversal stalls on it forever).

Conflating the two in one timing-dependent fallback ("sometimes we fabricate an epoch,
depending on mount timing") was the source of confusion. The code carried `TODO`s
admitting the authors were unsure when it fired.

A prior attempt (commit `667abfa`, reverted in `730b1fa`) introduced real phase
children but *kept the pseudo-leaf alive* behind an `autoLeaf` opt-out, then patched the
two mechanisms to coexist. That coexistence was the actual source of the remaining
hackiness. This ADR records the clean version: remove the pseudo-leaf wholesale.

## Decision

Remove the pseudo-leaf mechanism entirely, splitting its two jobs:

1. **Job B → real phase children.** `usePhaseEpoch` creates a real child epoch per phase,
   named after the phase, created directly in `goTo` (and once at init for the first
   phase) — not via a watcher, because child creation is a direct consequence of the
   phase changing, not of anything else (not) happening.

2. **Job A → throw.** `ESequence`/`ERepeat` now *require* epoch children. A sequence step
   that becomes active with no child epoch throws an informative error instead of
   fabricating a leaf.

Design constraints:

- **No `EPhase` component.** Authors keep writing `usePhaseEpoch` + `<Phase>`; the child
  epoch is created internally.
- **No watcher for phase children.** Created synchronously in `goTo`/init.
- **Mounted epochs attach to the phase child.** An `EPage` (or `PContinue`, or a nested
  `<ESequence>`) inside an active `<Phase>` becomes a child of that phase's epoch.
- **Loop handling in traversal: do not throw.** If the outline traversal revisits a phase
  (a possible loop, e.g. `goTo(0)`), call `done()` on the parent phase epoch rather than
  erroring or looping forever.

### Naming

"Leaf" was wrong (a phase child may itself have children). The per-phase child is named
after its phase, yielding ids like `…[<phase>]-<phase>` (e.g. `clicktest[play]-play`).

## Implementation

- **`useIndexableEpoch`** — the `startNewPseudoLeaf` helper, `activeLeaf` variable, and
  leaf-fabricating watcher are gone. A detection watcher remains: for the non-phase case,
  when a step becomes active but no real child mounts and takes over as `currentEpoch`, it
  throws. Detection uses the same timing as the old fallback (`onMounted` when in a
  component, `nextTick` otherwise); child `onMounted` runs before parent's, so a real
  `ESequence`+`EPage` never false-throws. The phase guard (`isPhaseEpoch(E)`) is checked
  *inside* the deferred callback because `phase`/`phases` are only assigned after
  `useIndexableEpoch` returns.

- **`usePhaseEpoch`** opts into managing its own children:
  - `enterPhaseChild()` disables the previous phase child (so ending it does not advance
    the parent — the phase change itself is the navigation), creates a new
    `makeEpoch({ name: phase, parent: E })`, sets it current, and logs `epoch.start`.
  - `goTo` calls `enterPhaseChild()` after updating the step; `next`/`prev` route through
    `goTo` (they previously mutated `step` directly and would bypass child creation); the
    first phase's child is created once at init.
  - `done` is wrapped to disable the active phase child before delegating.
  - `E.phaseEpoch: Ref<Epoch | null>` exposes the currently-active child.

- **`injectParentEpoch`** resolves a phase epoch to its active phase child. This is what
  makes mounted epochs/affordances attach to the phase's child. (Providing from `<Phase>`
  does not work: Vue resolves injection for slot content against the slot's *owner*, not
  the component rendering the slot, so a `provide` inside `<Phase>` would not reach
  slotted `<EPage>`s.)

- **Outline traversal** (`useEpochTree.ts`) advances any step-less epoch (real phase
  children included) and tracks visited ids; on revisiting one it calls
  `epoch._parent.done()` instead of advancing again, ending a looping phase epoch. The
  `leaf_<step>` rename in `cloneSubtreeForStep` and the `isPseudoLeaf` traversal branch
  are removed.

- **`isPseudoLeaf`** is removed from the `Epoch` type, `makeEpoch`, the `useEpoch`
  warning, and the `leaf_`-skip in `jumpToEpochImpl`.

## Consequences

- Phases are now ordinary epochs: real ids, real `epoch.start` logging, real lifecycle,
  and directly jump-addressable (previously the `leaf_` segment was skipped in jump paths).
- **Breaking for saved data / jump targets:** the per-phase id changed from
  `…[<phase>]-leaf_<phase>` to `…[<phase>]-<phase>`.
- **Breaking for sequence authoring:** a bare presentational leaf under `ESequence`/
  `ERepeat` now throws; it must be wrapped in an `EPage`.
- `constant`/`persist` phases that stay mounted across phase changes are display-only
  overlays and are not intended to host epochs; injection resolves to whichever phase
  child is active at injection time.

## Verification

- `bun run typecheck` clean.
- `grep` confirms zero remaining `isPseudoLeaf` / `leaf_` / `autoLeaf` references.
- Control flow reasoned through for `EClickTest` and `PhasesDemo` (including the `apple`
  phase that nests an `ESequence`, and the looping `choice`/`durian` phases).
- Browser-verified by the user.

## Alternatives considered

- **Keep a sequence-only fallback (auto-create a child for bare leaves inside
  `ESequence`/`ERepeat`).** Rejected: it retains the mechanism — and the timing-dependent
  complexity — we set out to delete, for a vestigial case. Throwing is simpler and pushes
  authors to the already-standard `EPage` wrapper.
- **`ESwitch` generalization.** Whether "phase" should be a more general condition-driven
  control-flow construct was discussed and deferred; this change does not foreclose it.
