# ADR 0004: Playwright end-to-end testing for experiments

- **Status:** Proposed (no decision)
- **Date:** 2026-06-02
- **Scope:** `core/` template layer + project root, `simplified` branch
- **Related:** [0003-offscreen-outline-traversal.md](./0003-offscreen-outline-traversal.md)
- **Relevant files:** `core/pages/dev.vue`, `core/pages/exp.vue`, `core/composables/fastMode.ts`,
  `core/composables/useCurrentSession.ts`, `core/composables/useDataWriter.ts`,
  `core/composables/logEvent.ts`, `components/Experiment.vue`, `package.json`, `nuxt.config.ts`

## Context

The template has **no automated tests**, and neither do any of the four reference projects
(`graphnav2`, `bandit-task`, `rlwm-task`, `prakhar-prediction`). The only way to verify that an
experiment runs end-to-end today is to launch `bun run dev`, open `/dev`, and click through the
timeline by hand. This is slow, easy to skip, and gives no regression signal when `core/` changes
under a project — exactly the migration risk the `simplified` branch is meant to manage via
`CHANGES.md`.

An experiment is fundamentally a **linear timeline of interactive pages** (`ESequence` of
`EPage` / `ERepeat` / `ENavigableSequence`, ending in `ECompletion`). The thing most worth
testing is the one thing hand-testing actually checks: *can a participant get from the first page
to completion, and does the experiment log the data it claims to?* That is a browser-level,
end-to-end concern, which is what Playwright is built for. Unit-testing individual epoch
components in isolation is lower value here — the components are tightly coupled to live epoch
context (`useEpoch`, the data writer, timers), so component tests would mostly re-implement the
harness.

This ADR surveys the options and recommends a direction. It does not commit to an implementation.

## What already exists that helps

- **`/dev` route** (`core/pages/dev.vue`) renders `<Experiment />` directly, forces `mode=debug`,
  and skips all Prolific identity validation. This is the natural test entry point — no fake
  Prolific IDs needed.
- **`fast` flag** (`core/composables/fastMode.ts`): `?fast` (or `sessionStorage.fast`) collapses
  `EPage` durations and `PButton` delays to a small floor. A full timeline that takes minutes by
  hand runs in seconds under `?fast`. This is the single most important lever for fast E2E.
- **In-memory event log**: `useDataWriter().events` holds every `logEvent` call for the session,
  and in `dev` mode the writer never needs Firebase. Tests can assert on logged events without a
  backend (see "Data assertions" below).
- **Playwright MCP is already wired up** for interactive/agent use (the `.playwright-mcp/` dir,
  already git-ignored). That is *not* a test suite — it is ad-hoc browser driving. A real suite
  needs `@playwright/test` as a dev dependency with a committed config and spec files.

## What is missing

- **No stable selectors.** Components render no `data-testid` / `data-epoch` attributes
  (confirmed: zero matches in `core/components`). Tests must currently rely on visible text and
  ARIA roles, which are brittle against copy changes. A small, opt-in test-hook attribute on the
  epoch wrapper and on `PButton`/`PContinue`/`PKey` would make specs robust. This is the main
  template-layer change the proposal would introduce.
- **No way to read logged data from a test** other than scraping the DOM. A tiny dev-only bridge
  (e.g. `window.__epoch` exposing `dataWriter.events`) would let specs assert on the data the
  experiment produces, which is the real contract of an experiment.

## Options considered

### A. Playwright `@playwright/test` E2E against the dev server (recommended)

Add `@playwright/test`, a `playwright.config.ts` whose `webServer` runs `bun run dev`, and specs
that drive `/dev?fast`. A smoke spec lives in `core/` (template-owned, runs against the template's
own `Experiment.vue` analog or the `/demo` pages); projects add their own specs at the repo root.

- **Pros:** Tests the real thing (real Nuxt, real epoch engine, real browser). `?fast` keeps it
  quick. Matches how the app is actually run. One dependency.
- **Cons:** Needs the dev server up (handled by `webServer`). Slower than unit tests
  (seconds, not ms). Requires the selector/data hooks above to be non-brittle.

### B. Vitest + `@vue/test-utils` component/unit tests

Mount individual components or composables in jsdom.

- **Pros:** Fast, no browser.
- **Cons:** Epoch components don't work in isolation — they need live epoch context, timers, and
  the data writer. Tests would mock so much harness that they'd assert against the mocks, not the
  experiment. Low value for the timeline-completion question that matters most. Could be added
  later for pure helpers (`preprocessing.ts`, data-view transforms) where it pays off.

### C. Nuxt Test Utils (`@nuxt/test-utils`) E2E

Nuxt's own E2E wrapper (can drive Playwright under the hood).

- **Pros:** Nuxt-aware server lifecycle.
- **Cons:** Extra abstraction over plain Playwright for little gain here; the `/dev` entry point
  already removes the auth friction that this layer would otherwise smooth. Heavier setup.

## Recommendation

Adopt **Option A** with two small enabling changes in `core/`:

1. **Test hooks.** Add opt-in, dev-stripped selectors:
   - `data-epoch="<epoch id>"` on the epoch wrapper element (the epoch id already exists and is
     stable per the naming rules in `CHANGES.md`).
   - `data-pkey` / `value`-derived `data-testid` on `PButton`/`PButtons`/`PKey`/`PContinue`.

   These let specs target "the choice button labeled `orange`" or "the page named `feedback`"
   without depending on prose.

2. **Data bridge.** In dev only, expose `window.__epoch = { events: () => dataWriter.events, ... }`
   so a spec can assert e.g. that `experiment.begin` fired, that N `trial`-level events were
   logged, and that `ECompletion` was reached. This makes the *data contract* testable, not just
   the DOM.

Then:

3. Add `@playwright/test` + `playwright.config.ts` (`webServer: bun run dev`, baseURL
   `http://localhost:3030`).
4. Add a **template smoke spec** in `core/` that walks the `/demo` pages and/or a minimal
   timeline to completion under `?fast`, asserting completion is reached and key events logged.
   This is the regression signal for `core/` changes during migration.
5. Add a `test` script to `package.json` (`playwright test`) and document in `AGENTS.md` that
   project authors should write a "happy-path to completion" spec for their `Experiment.vue`.
6. Git-ignore Playwright artifacts (`test-results/`, `playwright-report/`, `.playwright/`).

### Why this scope

The proposal deliberately stops at *one happy-path E2E per experiment* plus a template smoke
test. That single test catches the failure mode that actually bites experimenters — "core changed
and now my timeline can't reach completion" — at low authoring cost, and it leans entirely on
infrastructure that already exists (`/dev`, `?fast`, the in-memory event log). Broader coverage
(condition branches, survey validation, multi-tab/window-enforcer paths) can be layered on later
without re-litigating the foundation.

## Open questions

- Should the test hooks (`data-epoch`, etc.) be always-on or stripped from production builds? Lean
  toward stripping in `nuxt build` to avoid leaking internal ids to participants.
- Where should the template smoke spec point — at `/demo/*` (stable, template-owned) or at a
  dedicated fixture timeline? `/demo` is the lower-maintenance choice.
- Is a `window.__epoch` bridge acceptable, or should the data assertion go through PostHog/Firebase
  emulation? The in-memory bridge is far simpler and sufficient for happy-path checks.
- CI: run headless Playwright in GitHub Actions, or leave it as a local pre-deploy check? The
  existing deploy flow already gates on a clean worktree; a test gate could slot in there.
