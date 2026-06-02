# ADR 0003: Run outline traversal off-screen to avoid disrupting the participant

- **Status:** Proposed (feasibility study; no decision)
- **Date:** 2026-06-02
- **Scope:** `core/` template layer, `simplified` branch
- **Related:** [0001-remove-pseudo-leaf.md](./0001-remove-pseudo-leaf.md), [0002-epoch-id-not-unique-over-time.md](./0002-epoch-id-not-unique-over-time.md)
- **Relevant files:** `core/internal/composables/useEpochTree.ts`, `core/internal/components/EpochOutline.vue`,
  `core/composables/useEpoch.ts`, `core/composables/useDataWriter.ts`, `core/utils/globals.ts`,
  `core/composables/useRandom.ts`, `core/composables/useMultipleTabDetection.ts`

## Context

The epoch outline (the "Epochs" dev panel) shows the full structure of an experiment timeline.
Discovering that structure is expensive: the system does not have a static description of the
tree, so it learns the tree by **actually stepping the live experiment**. `traverseTimeline`
(`useEpochTree.ts:402`) watches `currentEpoch` and repeatedly calls `epoch.done()` / `goTo()`
to walk from the current position all the way to `__TOP_EPOCH__`, with the `DataWriter`
disabled (`useDataWriter().withDisabled(...)`), recording each epoch it passes through. When it
finishes it jumps the participant back to where they were and saves the serialized tree to
`localStorage` (`saveCachedOutline`).

This is disruptive in two ways:

1. **During traversal**, the live experiment is driven forward through every epoch — components
   mount and unmount, phases advance and loop, animations are suppressed. The participant's view
   is hijacked for the duration.
2. **After traversal**, when `saveAndReload` is set, the code does a hard
   `window.location.reload()` (`useEpochTree.ts:487`). Stepping the whole timeline and jumping
   back cannot be guaranteed to restore pristine component / phase-loop / RNG-consumption state,
   so the reload exists to put the participant back on a clean load that matches the freshly
   saved outline. **That reload is the core disruption this ADR is about.**

To avoid both, traversal is gated behind `autoTraverse` (default on, toggle in the panel) and
cached aggressively: the cache is honored across reloads and validated *structurally* against
the live path rather than by a short TTL (`livePathMatchesCache`), so a saved outline survives a
long time. But the *first* discovery on any new page, and any rebuild after the structure
changes, still pays the traverse-and-reload cost.

**Goal:** keep the outline current without ever stepping or reloading the participant's tab.
Run the traversal somewhere off-screen, and have the participant's tab pick up the result.

## Why this is even possible

Two properties of the current system make an off-screen traversal tractable:

- **Epoch structure is deterministic per session.** `Math.random` is globally replaced by a
  session-seeded RNG (`globals.ts:5-15`, `useRandom.ts`). The global stream is seeded by
  `sessionId` and is *not* persisted (`storeState` defaults false), so a **fresh load** of the
  same `session_id` reconstructs the *same* tree — that is exactly what the participant's own tab
  would produce on a clean reload. A second context that loads the experiment fresh with the same
  `session_id` will traverse the identical structure. (Caveat: any epoch whose existence depends
  on `trueRandom()`, wall-clock time, or live server state is not reproducible — see Risks.)
- **The cache is already cross-context.** The outline lives in `localStorage` keyed by route
  (`OUTLINE_CACHE_PREFIX`), which is shared across same-origin tabs, and the template already
  runs a `BroadcastChannel` for multi-tab coordination (`useMultipleTabDetection.ts`). A worker
  context can write the cache and ping the participant tab to load it — no traversal needed in
  the participant tab at all.

So the participant tab's job shrinks to: **never traverse; only ever load a cache that something
else produced.** It already supports this — a cache is honored even when `autoTraverse` is off
(`initializeOutline`, the "always honored" branch). The open question is *what* produces the
cache and *how* the participant tab is told to refresh it without a self-reload.

## Options

The four options differ in *where* the off-screen traversal runs. In all of them the producer
loads the experiment fresh at the current page with the participant's `session_id`, runs
`traverseTimeline`, writes the route-keyed cache, and signals the participant tab to hot-swap
the new tree into `root` (no `window.location.reload`).

### A. Hidden same-origin iframe (in the participant's own page)

The participant's page mounts an invisible `<iframe>` pointing at the dev/exp route with the
same `session_id` (and a flag like `?outline_worker=1`). The iframe is a full, independent Nuxt
app instance: its own Vue tree, its own `currentEpoch`, its own seeded RNG. It traverses itself,
writes the `localStorage` cache (shared with the parent, same origin), and `postMessage`s the
parent. The parent reloads the cache into `root` in place.

- **Pros:** No second browser, no tooling; ships with the app. Same-origin → shared
  `localStorage` and trivial `postMessage`. The iframe stepping itself never touches the parent's
  DOM, components, or RNG stream, so **the participant sees nothing** and no reload is needed.
- **Cons:** The iframe boots a second copy of the whole app (cost, memory) and a second
  `DataWriter` / session lifecycle that must be neutralized so it does not log events or write to
  Firebase (must force `mode: 'debug'` or a dedicated no-op writer, like `/dev` already does at
  `dev.vue:7-18`). `useMultipleTabDetection` will see the iframe as another tab and could trip
  multi-tab warnings / `isPrimary` logic — the worker must be excluded. Same-origin iframes share
  the event loop with the parent, so a heavy traversal still competes for the main thread (jank,
  not correctness).

### B. Separate browser tab (opened/owned by the participant tab)

Like A, but the worker is a real top-level tab (`window.open` with `?outline_worker=1`), not an
iframe. Communicates via `BroadcastChannel` (already present) + shared `localStorage`.

- **Pros:** A real tab gets its own event loop, so traversal does not jank the participant tab.
  Reuses the existing `BroadcastChannel` infra directly.
- **Cons:** `window.open` is popup-blocked unless user-initiated; a visible extra tab is itself a
  distraction (defeats the purpose) unless minimized/backgrounded, and background tabs are
  throttled by the browser (timers/rAF clamped), which can stall a watcher-driven traversal that
  depends on ticks. Same `DataWriter` and multi-tab-detection neutralization problems as A, now
  for a real tab that the detection logic is specifically built to notice.

### C. Out-of-band Playwright / headless browser (dev-only)

A headless browser, driven by Playwright, loads the route with the participant's `session_id`,
traverses, and writes the cache to a shared store the participant tab can read. Because it is a
*separate browser*, `localStorage` is **not** shared; the cache must travel over a side channel
(a tiny dev endpoint, a file the dev server serves, or Firebase under a debug path), and the
participant tab polls / subscribes to it.

- **Pros:** Fully off the participant's machine path — zero main-thread or tab cost in the
  participant browser. Can run on a schedule / in CI to pre-warm caches for known sessions. Good
  fit for a **developer** pre-generating outlines, which is the actual audience of the dev panel.
- **Cons:** Heaviest infrastructure (a server-side runner, a transport for the cache, auth for
  the participant tab to fetch it). Determinism is more fragile across a genuinely different
  browser/runtime if anything reads `navigator`, timing, or viewport. Not viable for a real
  participant in the field (no Playwright on their machine) — this is a dev/preview tool, not a
  production mechanism.

### D. Don't traverse at all — declare the structure (out of scope here, noted for contrast)

Replace runtime discovery with a static/derived description of the tree (e.g. a build-time or
mount-time declaration of epoch structure), eliminating traversal entirely.

- **Pros:** No traversal, no reload, no off-screen anything — the disruption simply ceases to
  exist. Strictly the cleanest end state.
- **Cons:** Large redesign of how structure is known; conditional/randomized structure still
  cannot be fully known without running; orthogonal to "run traversal elsewhere." Listed only to
  frame the others as *workarounds for runtime discovery*, not the only path.

## Cross-cutting work required by A–C

Any off-screen producer needs the same three things, independent of where it runs:

1. **A neutralized producer session.** The worker must not log events, must not write the
   participant's Firebase data, and must not double-count toward bonus/session state. The
   cleanest lever is the existing one: force `mode: 'debug'` (as `/dev` already does) or give the
   worker a dedicated no-op `DataWriter`. `traverseTimeline` already disables the writer *during*
   the walk; the concern is the rest of the worker's lifecycle (init, `epoch.start` on first
   mount, unload).
2. **Exclusion from multi-tab detection.** `useMultipleTabDetection` would treat the worker as a
   rival tab (heartbeats, `isPrimary`, `sessionMismatch` logging). The worker (and iframe) must
   announce itself as a worker and be filtered out, or skip the composable entirely when
   `?outline_worker=1`.
3. **A hot-swap path in the participant tab.** Today a fresh cache is consumed only on
   load/route-change/init. We need a "cache updated externally → rebuild `root` from it now"
   entry point: on a `BroadcastChannel`/`storage` event, re-run the existing cache-load branch of
   `initializeOutline` and assign `root` — **without** `window.location.reload`. This is the one
   genuinely new piece of participant-tab logic; everything else already exists.

## Risks and unknowns

- **Determinism is load-bearing.** The whole approach rests on "same session → same tree." It
  breaks for structure that depends on `trueRandom()`, wall-clock, server responses, or any RNG
  consumed in a *different order* than the participant tab consumes it. The walk-order in a
  worker that only traverses may differ from a participant who interacts, if interaction consumes
  the global RNG stream. **This needs empirical validation on the example projects before
  committing** (graphnav2, bandit-task, rlwm-task, prakhar-prediction).
- **The reload exists for a reason.** Replacing `window.location.reload()` with an in-place
  `root` swap is only safe in the participant tab *because the participant tab never traversed* —
  it stays on its clean load and only swaps data. We must make sure no code path leaves the
  participant tab having traversed and then expects the reload to clean up after it.
- **Background-tab / iframe throttling** can stall a watcher-driven traversal (B especially).
- **Second app boot cost** (A, B): memory and CPU for a whole extra Nuxt instance per page that
  needs an outline.

## Recommendation (non-binding)

There **is** a plausible way forward, and it is **Option A (hidden same-origin iframe)** for the
in-app case, because it reuses shared `localStorage`, needs no popup permission, never touches
the participant's DOM/RNG, and turns the participant tab's job into "load a cache someone else
made" — which the code already supports. The new work is small and well-contained: neutralize the
iframe's session, exclude it from multi-tab detection, and add a broadcast-driven in-place cache
reload to the participant tab (replacing the `reload()`).

**Option C (Playwright)** is the better fit for a *developer* pre-warming outlines (and could run
in CI), but is not a participant-facing mechanism. **Option B** is dominated by A for the in-app
case (popup/throttling costs without a compensating benefit). **Option D** is the real long-term
fix but a separate, much larger effort.

Before building anything, validate the determinism assumption (Risks #1) on the example projects;
if structure is not reliably reproducible from `session_id` alone, none of A–C are sound and the
effort should redirect toward D.

## Open questions

- Is epoch structure reproducible from `session_id` alone across the example projects, or does
  any of them branch structure on `trueRandom()` / server state / interaction-order RNG?
- For A, what is the lightest way to neutralize the iframe's `DataWriter` and session — reuse the
  `/dev` `mode: 'debug'` path, or a dedicated `?outline_worker=1` boot mode that skips data,
  multi-tab detection, bonus, and unload entirely?
- Should the in-place cache swap also drive the *current* page outline live as the participant
  navigates, or only refresh on the broadcast signal?
- Does the participant tab need any traversal capability left at all, or can `autoTraverse` and
  the in-tab `traverseTimeline` be removed from the participant path once a producer exists?
