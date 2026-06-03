# ADR 0003: Run outline traversal in a hidden iframe worker (no participant-tab reload)

- **Status:** Accepted (direction chosen; implementation pending)
- **Date:** 2026-06-02
- **Scope:** `core/` template layer, `simplified` branch
- **Related:** [0001-remove-pseudo-leaf.md](./0001-remove-pseudo-leaf.md), [0002-epoch-id-not-unique-over-time.md](./0002-epoch-id-not-unique-over-time.md)
- **Relevant files:** `core/internal/composables/useEpochTree.ts`, `core/internal/components/EpochOutline.vue`,
  `core/layouts/default.vue`, `core/pages/dev.vue`, `core/composables/useEpoch.ts`,
  `core/composables/useDataWriter.ts`, `core/composables/useMultipleTabDetection.ts`

## Context

The epoch outline (the "Epochs" dev panel) shows the full structure of an experiment timeline.
There is no static description of that structure: the system discovers it by **actually stepping
the live experiment**. `traverseTimeline` (`useEpochTree.ts:402`) watches `currentEpoch` and
repeatedly calls `epoch.done()` / `goTo()` to walk from the current position to `__TOP_EPOCH__`
with the `DataWriter` disabled, recording each epoch. When it finishes it tries to restore the
developer's position (`setCurrentEpoch(liveRoot)` + `jumpToEpoch(previous.id)` + `refreshTree()`,
`useEpochTree.ts:477-480`) and then, when `saveAndReload` is set, does a hard
`window.location.reload()` (`useEpochTree.ts:487`).

**That reload is the friction this ADR removes.** It is disruptive to the *developer* — it
flashes the page and discards scroll position and transient UI state every time the outline is
(re)built, e.g. after the structure changes during development.

The reload is not gratuitous. Stepping the experiment forward and jumping back **cannot** restore
pristine page-level state: experiment components can have arbitrary mount/unmount side effects,
and we do not control or constrain that state. **In-place recovery after a same-tab traversal is
therefore impossible by assumption** — which is exactly why the reload exists, and why simply
deleting it (or trying to clean up after the jump-back) is not an option. If the outline is to be
produced without disrupting the developer, **the traversal must not run in the developer's tab at
all.**

Two existing properties make an off-tab producer cheap:

- **The outline cache is already cross-context.** It is plain serializable JSON
  (`CachedEpochOutline`) in route-keyed `localStorage` (`OUTLINE_CACHE_PREFIX`), shared across
  same-origin tabs, and the template already runs a `BroadcastChannel`
  (`useMultipleTabDetection.ts`).
- **The dev chrome is already gated.** `layouts/default.vue` renders the whole dev panel —
  including `<EpochOutline />` — only when `devTools` is on (driven by `getUrlFlag('noDev')`). A
  context loaded with `?noDev` renders the bare experiment with **no outline panel**, so a worker
  cannot recurse into spawning its own worker.

Determinism of the produced tree is **explicitly out of scope**: we assume the epoch outline is
always the same for a given experiment, so a fresh load reconstructs the same structure.

## Decision

Run the traversal in a **hidden, same-origin `<iframe>` worker** (Option A below). The
developer's tab becomes a **pure consumer**: it never traverses, never reloads, and only swaps
`root` from the cache the worker produces.

Decided parameters:

- **Refresh trigger: on HMR / structure change.** The worker re-traverses when the experiment
  structure changes (HMR update or detected divergence) and pushes a fresh outline, which the
  developer's tab loads in place. No manual Reindex required for the common case (Reindex remains
  as a manual fallback).
- **Worker isolation: force debug/dummy mode.** The worker boots with `mode: 'debug'` (the path
  `pages/dev.vue:7-18` already uses) so its `DataWriter` never writes the real session — rather
  than introducing a separate worker boot mode.

## Options considered

In all of A–C the producer loads the experiment fresh at the current route, runs
`traverseTimeline`, writes the route-keyed cache, and signals the developer's tab to hot-swap the
new tree into `root` — replacing `window.location.reload()` in the consumer path.

### A. Hidden same-origin iframe — **chosen**

The developer's page mounts an invisible `<iframe>` at the same route with `?noDev` (so it
renders no outline panel). The iframe is an independent app instance: its own Vue tree, its own
`currentEpoch`. It traverses itself, writes the shared `localStorage` cache, and `postMessage`s /
broadcasts the parent, which reloads the cache into `root` in place.

- **Pros:** Ships with the app; no second browser, no popup permission, no server. Same-origin →
  shared `localStorage` and trivial messaging. The iframe stepping itself never touches the
  parent's DOM, components, or state, so **the developer sees nothing and the tab never reloads**
  — which is the whole goal. The parent's job shrinks to "load a cache someone else made," which
  the code already supports (a cache is honored even when `autoTraverse` is off).
- **Cons / work required:**
  - The iframe is a second tab → trips `useMultipleTabDetection` (heartbeats, `isPrimary`,
    `sessionMismatch`). The worker must be excluded from it.
  - HMR coordination: both app instances HMR on edit; the worker must detect the structure change,
    re-traverse, push the cache, and signal the parent to swap — correctly across HMR boundaries.
  - Must guarantee the iframe renders no outline panel (`?noDev`) so it never spawns its own
    worker.
  - Resource cost (a second app instance) — judged a non-issue for a dev workflow.

### B. Separate top-level tab (`window.open`)

Same as A but a real tab instead of an iframe.

- **Rejected:** popup-blocked unless user-initiated; a visible extra tab is itself a distraction;
  background tabs are throttled (timers/rAF clamped), which can stall the watcher-driven
  traversal. No advantage over A for this audience.

### C. Out-of-band Playwright / headless browser + RTDB store

A headless browser traverses and writes the outline to a shared store. Because it is a separate
browser, `localStorage` is not shared, so the outline travels via RTDB (`useDatabase()`
get/set/sync already exist) under a session-independent path; the consumer reads it.

- **Not for the primary goal.** This does **nothing** for developer friction — a developer
  editing code still has no outline unless something produced one. Its value is the **secondary**
  audience: researchers viewing `/dev` from a live URL (who are not running the experiment
  themselves). For that case, writing the outline to RTDB from dev-mode traversal (and reading it
  on live `/dev`) is a cheap follow-on using existing primitives, optionally pre-warmed by
  Playwright at deploy. Tracked as future work, not part of this decision.

### D. Declare the structure statically

Replace runtime discovery with a static/derived description, eliminating traversal entirely.

- **Out of scope.** Cleanest long-term end state but a large redesign; orthogonal to "stop
  disrupting the developer's tab now."

## Consequences

- The developer's tab no longer reloads when the outline is built — scroll and transient UI
  state survive structure changes.
- A new "worker" responsibility exists: a hidden iframe that boots in debug mode, traverses, and
  publishes the outline; plus consumer-side logic to hot-swap `root` on a broadcast/storage
  signal instead of reloading.
- `useMultipleTabDetection` must learn to ignore the worker iframe.
- The in-tab `traverseTimeline` reload path (`useEpochTree.ts:481-488`) is removed from the
  developer/consumer path; traversal logic moves into the worker context.

## Open questions

- What exactly signals "structure changed" to the worker for the HMR-triggered re-traverse — a
  Vite HMR hook in the worker, or the existing `livePathMatchesCache` divergence check applied in
  the worker?
- How does the parent mount/own the iframe lifecycle (only on `/dev` with dev tools, torn down on
  route change)?
- Exact mechanism to exclude the worker from `useMultipleTabDetection` (a query flag the
  composable checks, or skip the composable when `?noDev`).
- Confirm `?noDev` is the right worker flag, or whether a dedicated `?outline_worker=1` flag is
  warranted purely to make intent explicit (without changing the debug-mode isolation decision).
