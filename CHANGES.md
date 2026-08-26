# Simplified Template Migration Notes

This branch simplifies the template by removing playback-specific infrastructure and the generic participant event abstraction. The goal is to make experiment code easier to understand and maintain while keeping the common `PButton`, `PButtons`, and `PKey` component names available for compatibility.

## Summary

- Added `docs/guide/browser-testing.md`, covering how to drive a running experiment from a browser agent: `?jump=<epochId>` to load straight into any epoch, `data-epoch-id` on outline rows (and the `epoch-outline:<route>` localStorage cache) to discover ids, and the event log as the verification surface. Note that `getUrlFlag` accepts only `1`/`true`/`yes`, so a bare `?noDev` or `?fast` is silently false.
- Added `docs/guide/README.md` as the canonical project-development guide. Project-level `AGENTS.md` files should point there instead of copying project-agnostic rules; the examples README remains the implementation index.
- Removed the playback page and playback controller UI from `core`.
- Removed `useParticipant.ts` and its event-bus / pid / input-blocking abstraction.
- Kept `PButton`, `PButtons`, and `PKey`; they (and `usePButton`, `EContinue`, and
  `onKeyPress`) still log `participant.*` events automatically, now directly from the
  primitives rather than through `useParticipant`. See "Logging" below.
- Moved keyboard response handling into `core/utils/keyPress.ts`.
- Removed template-managed participant input blocking; projects should block input explicitly in task code, usually with an `animating` or phase-state guard.
- Kept `usePButton`, but rewrote it to use a local event controller instead of `useParticipant`.
- Simplified epoch primitives by removing `EButtons`, `EKey`, `EWait`, and `EDelay`.
- Added `duration` to `EPage` for fixed-duration pages.
- Added slot-local `state` to `EPage` for simple reactive page state.
- Replaced `EInstructions` with `ENavigableSequence`, a sequence wrapper that lets users move between pages.
- Added optional `navPages` config for custom top-level developer navigation links.
- Added a condition inspector that can view and pin registered `useConditions` choices from the developer UI.
- Added `useConditions().assign({ main, counterbalance })`: main conditions retain nested enumeration, while each
  counterbalance combination is held fixed for a complete pass through the main design. Counterbalance combinations
  use a balanced-prefix order. The pure `getConditionsForAssignment()` helper exposes the same mapping for generated
  documentation and planning; existing `choice()` and `permute()` behavior is unchanged.
- Added a live `DataView` panel to the developer UI (`default` layout) that previews a declared `declareDataView` against the running session's events. It auto-selects the view whose name matches the current epoch (e.g. `clicktest`), with a dropdown to pick any registered view. If your project overrides `core/layouts/default.vue`, add `<DataView mb-2/>` to the right-hand dev column to get it.
- Fixed the live `DataView` panel to pass the current session metadata to data views, allowing previews to use session fields such as conditions.
- Removed the old `EpochView`; epoch navigation now lives in `EpochControls` and `EpochOutline`.
- Fixed `useLocalAsync` so settled promises are no longer reported as pending on component unmount.
- Added a key-press demonstration to the demo experiment.
- Replaced `ESurveySequence` with component-based survey epochs: `ESurveyWrapper`, `ESurveyButtons`, `ESurveyMultiButtons`, and `ESurveyText`.
- Changed `ESurveyMultiButtons` to use one epoch with internal question state so the shared prompt and buttons remain mounted between questions.
- Removed the core survey data view and shared survey response types; projects should declare survey data views for the exports they need.
- Added core preprocessing helpers for reusable survey response extraction and wide-format data views.
- Added a browsable `/demo` section in `core/pages/demo/` that hosts standalone documentation pages, and a `Demo` link in the top NavBar. It covers the core epoch building blocks — `sequence`, `repeat`, `instructions` (ENavigableSequence), `phases`, plus `outline` (dynamic epoch structure) and `error` (error boundary). These pages double as runnable, commented documentation and replace the ad-hoc `EDemo*` components (`EDemoPhases`, `EDemoOutline`, `EDemoError`) that were previously rendered inside the demo experiment; if your project copied those components, delete them and visit `/demo` instead.
- Removed the `core/pages/test/` pages and the `Test` NavBar link; the `/demo` section replaces them.
- Updated the deploy/git-status clean-worktree check to ignore `core/pages/demo` instead of `core/pages/test`.
- Scoped the epoch outline cache per page (keyed by the page's root epoch id) so the outline rebuilds when navigating between pages with different timelines, e.g. `/dev` and `/demo/*`. The `localStorage` key changed from `epoch-outline` to `epoch-outline:<rootId>`; the old key is now unused and can be cleared.
- Moved epoch-outline traversal off the developer's tab into a hidden iframe worker, so building/refreshing the outline no longer reloads the page (see `core/docs/adr/0003-offscreen-outline-traversal.md`). The developer's `/dev` tab no longer traverses the timeline itself; it mounts a hidden iframe (`?outlineWorker=1&noDev`) that traverses, saves the shared `localStorage` cache, and broadcasts an update over a `BroadcastChannel`, which the tab applies in place. The worker re-traverses on HMR. **If your project overrides `core/layouts/default.vue`:** add `<OutlineWorkerFrame />` inside the dev-tools (`v-if="devTools"`) branch and `<OutlineWorkerDriver v-if="isOutlineWorker" />` inside the bare (`v-else`) branch, and force debug mode for the worker in `<script setup>` with `const isOutlineWorker = getUrlFlag('outlineWorker'); if (isOutlineWorker) useCurrentSession().mode = 'debug'`.
- Epoch-outline traversal failures now appear in the visible Epochs panel with the root error, epoch, and component context. The hidden worker persists and broadcasts failures, aborts the failed traversal, and clears the message after a successful retry instead of silently leaving a partial outline.
- Fixed the epoch outline disappearing when `localStorage` is full. Caching the outline previously threw an unhandled `QuotaExceededError` from inside the worker's traversal cleanup, which skipped the `BroadcastChannel` update, so the developer's tab kept showing only the partial live-path outline. Caching is now best-effort: on a quota error the worker evicts other pages' cached outlines and retries, and if that still fails it sends the outline over the channel instead, so a full `localStorage` costs caching but never the outline itself. Persisting a traversal error is likewise best-effort so it cannot mask the error being reported.
- `DataWriter` now sweeps abandoned recovery queues. In live mode, `initializeSession` deletes `dataWriter-*` entries belonging to *other* sessions whose most recent activity is over 8 hours old, so unflushed queues no longer accumulate until they exhaust the origin's `localStorage` quota. Age is derived from the queued data itself (a flushed queue records `meta/lastUpdateTime`; event paths are keyed `<timestamp>—<index>—…`), taking the newest timestamp found. The sweep is deliberately conservative: the current session's queue is never touched, and a queue whose age cannot be established is kept rather than deleted, since it may hold participant data that never reached the database. Empty and unparseable entries are removed and left alone respectively. Deletions are logged with `console.warn`.

Note that `localStorage` is shared per origin, so a full quota is usually not the outline's doing. On one developer profile it was filled by `live/data/<sessionId>/` keys (~200 KB each) — the shape `getDBPath` produces, holding session event data. No current core code writes or reads them and Firebase is not responsible (its keys are all `firebase:`-prefixed), so their origin is unidentified; do not assume they are safely deletable without checking that those sessions reached the database.
- Removed demo modules from Nuxt's auto-import scan and lazy-load `/demo/<slug>` components from the demo manifest, so demo-only `declareDataView` calls are not registered by opening dashboards or the `/demo` index. See `core/docs/adr/0005-isolate-demo-imports-from-data-view-registry.md`.
- Fixed `DataWriter.metaMismatch` false positives when repeated debug sessions include empty local metadata objects, such as the `conditions: {}` object created by `useConditions()`, that Firebase omits when read back.
- Prolific submission review now treats sessions with a normal completion code and saved `completionTime` as full data even if `noReturnTime` was not recorded. Error and disconnected completion codes are not promoted by `completionTime` alone.
- Prolific assignment replacement now treats approved sessions with `SessionMeta.excluded === true` as incomplete, so they are counted when posting replacement places.
- Prolific study creation now has explicit participant exclusion options. The create-study filter panel can add a custom blocklist containing all valid participant IDs in `live/meta`, and can separately add Prolific's previous-studies blocklist. Both options are enabled by default in `studyDraft.exclusions`.
- Prolific study-list caching now records a completeness watermark. The first refresh backfills the full project study history; later refreshes only page back to the previous watermark while preserving the complete cached history. This makes Prolific's previous-studies blocklist use all cached historical study IDs without refetching the entire project on every study creation.
- Fixed Prolific study-list caching for projects with no studies. A successful empty refresh now records freshness instead of immediately refreshing again.
- The Prolific dashboard now requires a valid project ID before showing messages or studies. When setup validation fails, it shows API-token and project-ID instructions and can create a Prolific project through the Prolific API.
- The Prolific setup panels now use the dashboard's neutral panel styling, with unframed project selection controls.
- The Prolific study page's Add Places action now executes immediately and reports success after the API call resolves instead of asking for browser confirmation first.
- The version data dashboard now labels the processed-data path as `Data:`, reports whether it has been written, and uses an explicit Save button instead of the refresh icon.
- Restructured the `/demo` section into two: `/docs`, a human-facing documentation page (source in `core/internal/docs/`), and `/examples`, live minimal reference implementations (source in `core/internal/examples/`, indexed for agents by its `README.md`). The NavBar `Demo` link is replaced by `Docs` and `Examples` links, and the deploy/git-status clean-worktree check now ignores `core/pages/examples` instead of `core/pages/demo`. Projects that link to `/demo/<slug>` should update to `/examples/<slug>`; consider pointing project `AGENTS.md`/`CLAUDE.md` at `core/internal/examples/README.md`.
- Added `reset()` to `defineHook` hooks: drops pending `receive()` waiters (their promises never resolve). Since hooks are usually module-level, waiters outlive the component that registered them; call `reset()` when (re)entering the consuming flow (e.g. interactive instructions) to clear stale waiters left by jumps or HMR.
- `ECompletion` now accepts `showBonus="auto" | true | false` and defaults to `auto`. Automatic display shows the final bonus only after an enabled `useBonus().addPoints(...)` call; use `true` to always show it or `false` for studies without performance bonuses.
- Added a `MouseTracker` component as the standard way to attach mouse tracking to an epoch or phase-sized component. Prefer `<MouseTracker />` in the template over calling `useMouseTracking(...)` directly; pass options such as `:max-frames` only when the defaults need to be changed.
- Changed `useMouseTracking` overlap handling: if a second tracker starts while one is active, core now logs a warning and calls `done()` on the previous tracker so recorded frames are saved, instead of cancelling in HMR and throwing outside HMR.
- **⚠️ Breaking:** Removed `PContinue`; `EContinue` is the standard continue affordance. See "EContinue" below.
- **⚠️ Breaking:** Removed the internal pseudo-leaf mechanism. Phase epochs (`usePhaseEpoch`) now create a real child epoch per phase, and `ESequence`/`ERepeat` now require epoch children. See "Pseudo-Leaf Removal" below.

## EContinue

`EContinue` is the standard leaf epoch: it shows content and advances when the participant continues (a button, or the space key). It is the default for the most common screen in any experiment — an instruction or text page — and bundles the epoch wrapper, content slot, and continue affordance into one component.

This reverses an earlier decision on this branch that removed `EContinue` in favor of `EPage` + a standalone `PContinue`. In practice, `EContinue` is the dominant idiom in real experiments built on the template, and the split forced the verbose `EPage` + `PContinue` pairing for the most common screen. `PContinue` has been **removed**; its only real advantage over `EContinue` — placing the affordance manually — is now covered by `EContinue`'s `#bottom` slot, which renders content below the button / space prompt.

The division of labor:

- **`EContinue`** — the standard leaf for "show this, then continue". Props: `name`, `button` (boolean or label), `delay` (minimum reading time, ms), `prompt` (apply prompt styling to the slot), `small`. Slots: default (the content) and `#bottom` (content below the affordance).
- **`EPage`** — the lower-level epoch wrapper that `EContinue` builds on. Reach for it directly only when you need a bare epoch with no built-in continue control: a page that auto-advances via `:duration`, or one whose slot drives `done()`/`state` from script.
- **A custom component** — anything with real internal logic (phases, timing, shared state). A trial is a component, not an inline epoch tree. See the custom-epoch and full-experiment demos.

Migration (from the removed `EPage` + `PContinue` pairing back to `EContinue`):

```vue
<!-- before (PContinue removed) -->
<EPage name="welcome" flex-center flex-col>
  <h2>Welcome!</h2>
  <PContinue button="Start" delay=500/>
</EPage>

<!-- after -->
<EContinue name="welcome" button="Start" delay=500>
  <h2>Welcome!</h2>
</EContinue>
```

Notes:
- Move the affordance props (`button`, `delay`, `small`) onto `EContinue`; the slot content stays as the default slot.
- `EContinue` centers its content (`flex-center flex-col`) by default, so the explicit `flex-center flex-col` that the `EPage` migration added is no longer needed.
- Where a page had other content *after* the continue control, put it in the `#bottom` slot.
- Keep `EPage` where the page has no continue affordance (e.g. a `:duration` page, or a page whose slot calls `done()` directly).

## Pseudo-Leaf Removal

The epoch system previously had an internal **pseudo-leaf** mechanism: `useIndexableEpoch` (used by `ESequence`, `ERepeat`, and `usePhaseEpoch`) ran a watcher that, whenever a step became active without a real child epoch mounting for it, synthesized a placeholder epoch named `leaf_<step>` (or `leaf_<phase>`). This was load-bearing in two unrelated ways and special-cased across the jump, outline, and traversal code. It has been removed entirely.

In its place:

- **Phase epochs create real child epochs.** Each phase of a `usePhaseEpoch` now gets a real epoch named after the phase, created directly when the phase changes (in `goTo`, and once at init for the first phase). Phases are now ordinary epochs: they log `epoch.start`, appear in the outline, and are directly jump-addressable. Epochs and affordances mounted inside an active `<Phase>` (e.g. a nested `<ESequence>`) now attach to that phase's child epoch automatically.

- **`ESequence`/`ERepeat` require epoch children.** The pseudo-leaf used to cover for a bare presentational leaf with no enclosing epoch. That is no longer supported: a sequence step with no child epoch now throws an informative error. Use an `EContinue` (or another epoch component) as the child (this is already how the real experiment and demos are written).

**⚠️ Breaking for saved data / jump targets.** The per-phase epoch id changed from `…[<phase>]-leaf_<phase>` to `…[<phase>]-<phase>` (e.g. `clicktest[play]-play`). Any saved jump targets or data keyed on the old `leaf_<phase>` ids must be updated. Sequence/repeat step ids are unaffected (the `leaf_<step>` segment was internal and skipped in jump paths).

Migration:

- Ensure every direct child of an `ESequence`/`ERepeat` is an epoch component (almost always an `EContinue`, or a custom trial component).
- Update any persisted `jump` URL params or saved data that reference `leaf_<phase>` ids to the new `<phase>` ids.
- See `docs/adr/0001-remove-pseudo-leaf.md` for the full rationale.

## Playback Removal

Playback was removed because it was not viable as a supported feature and was driving complexity in normal experiment code.

Removed from `core`:

- `pages/playback.vue`
- `internal/components/PlaybackController.vue`
- `internal/components/PlaybackEventView.vue`
- `internal/composables/usePlaybackState.ts`
- Playback links from the session data table.
- Playback event loading helpers from local data.
- Playback-specific button styling/effects in `PButton`.

Migration guidance:

- Remove links or docs that point to `/playback`.
- Remove imports/usages of `usePlaybackState`, `PlaybackController`, or `PlaybackEventView`.
- If a project has custom playback UI, either delete it or treat it as project-specific code outside the template.

## Participant Abstraction Removal

`core/composables/useParticipant.ts` was removed. The old abstraction combined several jobs:

- Scoped component event buses.
- Automatic logging of `participant.*` events.
- Keyboard response collection.
- Playback support.
- Input blocking during display transitions.

Those responsibilities are now split or removed. Automatic `participant.*` logging was
kept, but the input primitives now log directly (see "Logging"); the buses, pids,
playback, and input blocking are gone.

### Removed APIs

Remove or replace usages of:

```ts
useParticipant()
useParticipantBus()
Participant
PARTICIPANT_INPUT_BLOCKED
withParticipantInputBlocked()
validateKeySpec()
```

`PButton`, `PButtons`, and `PKey` still exist, so many templates do not need immediate markup changes.

### Logging

The template-provided input primitives log their events automatically under the
`participant.*` namespace, and the developer event view highlights them:

- `PButton`, `PButtons`, `usePButton`, and `EContinue` (button mode) log
  `participant.click`, `participant.hover`, and `participant.mousedown`, each with
  `{ value }`.
- `onKeyPress` — and therefore `PKey`, `promiseKeyPress`, and `EContinue`'s space-key
  affordance — logs `participant.keyPress` with `{ key, rt }`.

These logs are for inspection/debugging, not your data record. They are emitted by the
generic primitives and are easy to bypass with regular buttons or custom UI, so don't
rely on them for coverage. Log semantic task data explicitly:

```ts
logTrial({
  choice,
  rt,
  reward,
})
```

## Keyboard Responses

Keyboard response handling now lives in `core/utils/keyPress.ts`.

Exports:

```ts
onKeyPress
promiseKeyPress
KEYS
Key
KeyPress
KeySpec
```

The behavior is meant to match the previous participant key handling closely:

- Key names are normalized to values like `SPACE`, `ENTER`, `LEFT`, and `A`.
- `keys` can be omitted to accept any supported key.
- Space-separated strings still work, e.g. `"A B C"`.
- Text inputs are ignored.
- Repeated keydown events are deduped by default.
- Returned responses include reaction time: `{ key, rt }`.

Old:

```ts
const P = useParticipant('Bandit')
const { key, rt } = await P.promiseKeyPress(['A', 'B'])
```

New:

```ts
const { key, rt } = await promiseKeyPress(['A', 'B'])
```

For callback-style handling:

```ts
const unsubscribe = onKeyPress('SPACE', ({ key, rt }) => {
  // ...
})
// onUnmounted(unsubscribe)  NOT necessary; automatically unsubscribed on unmount
```

`PKey` now uses `onKeyPress` internally, so this still works:

```vue
<PKey keys="SPACE" @press="handlePress" />
```

## Buttons

`PButton` and `PButtons` are now compatibility components. The `P` prefix no longer means "participant event logging"; it is just the existing component name.

Still supported:

```vue
<PButton value="Continue" @click="next" />
<PButtons values="left right" @click="choose" />
```

`PButtons` now forwards `disabled` to each child `PButton`.

`PButton` still exposes:

```ts
on(eventType, handler)
promise(eventType, predicate?)
```

That support exists for `usePButton` and component refs, not for global participant logging.

## `usePButton`

`usePButton` still supports the useful script-side pattern:

```ts
const StartButton = usePButton({ value: 'start' })

await StartButton.promise('click')
```

```vue
<StartButton />
```

Internally this now uses `core/utils/eventController.ts`, a small local event controller. It does not log events and does not participate in playback.

This remains useful for cases like `EClickTest`, where the script wants to await a typed button event while the template renders the button.

## Input Blocking

Template-level participant input blocking was removed.

Old behavior:

- `useDisplayPhases` wrapped transitions in `withParticipantInputBlocked`.
- `PButton` ignored events while `PARTICIPANT_INPUT_BLOCKED` was true.
- This only covered participant components and did not protect regular buttons, forms, direct key listeners, or custom UI.

New guidance:

- Consumers should block input explicitly where needed.
- Use task state such as `animating`, `phase`, or `ready`.
- Guard handlers directly:

```ts
const onChoice = (choice: Choice) => {
  if (animating.value) return
  // handle choice
}
```

For `PButton`, use normal props:

```vue
<PButton :disabled="animating" value="Continue" @click="next" />
```

For key responses, gate the handler:

```vue
<PKey keys="SPACE" @press="!animating && next()" />
```

## Epoch Components

`EPage` is now the standard primitive for single-step custom epoch UI. It exposes the epoch through the default slot and supports fixed-duration pages:

```vue
<EPage name="feedback" :duration="1000">
  Correct!
</EPage>
```

This replaces `EDelay`.

The shorthand epoch components `EButtons`, `EKey`, and `EWait` were removed. Use explicit `EPage` markup instead:

```vue
<EPage name="choice" v-slot="{ done }">
  <PButtons values="left right" @click="done" />
</EPage>
```

```vue
<EPage name="response" v-slot="{ done }">
  <PKey once keys="F J" @press="done" />
</EPage>
```

For async hook-based waits, prefer explicit lifecycle code on `EPage`:

```vue
<EPage @mounted="async (epoch) => {
  await hooks.afterFeedback.receive()
  epoch.done()
}" />
```

`EContinue` remains supported because it standardizes a common continuation UI, including button, keyboard, and delay behavior.

`EInstructions` was renamed to `ENavigableSequence` and no longer injects a default welcome page. Put any welcome or instruction copy directly in project code:

```vue
<ENavigableSequence v-slot="{ enableNext }">
  <EPage name="welcome" @mounted="enableNext">
    Thanks for participating in our experiment!
  </EPage>
  <EContinue button="Start">
    Task-specific instructions...
  </EContinue>
</ENavigableSequence>
```

## Data And Event Views

The core `PEvent` type and `isParticipantEvent` helper were removed from `core/internal/data.ts`.

The debug event view no longer gives participant events special formatting or participant/hover filters. Existing historical data that contains `participant.*` events will still appear as ordinary logged events when loaded, but new template code no longer creates those events.

PostHog no longer needs to blacklist `participant.hover` and `participant.mousedown`, because those events are no longer emitted.

## Developer Navigation

`epoch.config.ts` can now define extra top-level navigation links with `navPages`:

```ts
export default defineEpochConfig({
  // ...
  navPages: {
    Docs: '/docs',
    Stimuli: '/stimuli',
  },
})
```

These links are appended to the built-in developer nav links for Experiment, Prolific, Data, and Test. Existing configs do not need to change.

## Conditions

Use `useConditions().assign({ main, counterbalance })` when an experiment contains both primary experimental
conditions and nuisance counterbalances. Main conditions form the inner assignment loop. The selected counterbalance
combination changes only after every main combination has been assigned, and counterbalance combinations are ordered
to minimize marginal imbalance within the counterbalance dimensions.

```ts
const conditions = useConditions().assign({
  main: {
    treatment: ['control', 'treatment'],
  },
  counterbalance: {
    taskOrder: ['AB', 'BA'],
    responseSide: ['left', 'right'],
  },
})
```

`getConditionsForAssignment(assignment, design)` returns the same assignment without Vue state, and
`getConditionAssignmentCount(design)` returns the full cycle length. Use these helpers for generated assignment tables
or planning tools. See `/docs` → Condition assignment for a live table generated by the helper.

Existing `choice()` and `permute()` calls retain their previous mixed-radix behavior. Migrating an existing experiment
to `assign()` changes its assignment mapping; increment the experiment version when doing so.

The developer UI now includes a condition inspector for choices registered through `useConditions().choice(...)` or `useConditions().permute(...)`.

Each condition can be pinned in the UI. Pinned conditions are written to URL parameters named `condition.<key>`, and the assignment counter only advances across unpinned conditions. This makes it possible to test a fixed condition while still cycling other condition dimensions.

The `useConditions()` return shape changed after the initial inspector implementation:

```ts
const { conditions, options, isPinned, choice, permute } = useConditions()
```

The temporary `selectedIndices` and `setConditionIndex` fields are no longer exposed. Project code should normally continue to use only `choice(...)`, `permute(...)`, and the returned `conditions`.

## Epoch Developer Tools

`core/internal/components/EpochView.vue` was removed. The old bookmark UI and direct phase/step dropdown controls are gone.

Use the outline and controls panel instead:

- Pin or jump to leaf epochs from `EpochOutline`.
- Use the previous/next buttons and fast-mode toggle in `EpochControls`.
- Use the `jump` URL parameter for pinned epoch state.

Core now provides `useUrlParam(...)` in `core/utils/url-params.ts` for reactive URL parameter state. This is used by condition pinning and epoch pinning, and is available for project developer tooling when needed.

## Demo Experiment

The demo experiment now includes a key-press example:

```vue
<EPage name="key" v-slot="{ done }">
  <PKey keys="K" @press="done" />
</EPage>
```

This is in the instructions flow after the button-click example so projects can see both supported response styles.

## Migration Checklist

1. Update the `core` submodule to this branch/version.
2. Search project code for `useParticipant`, `useParticipantBus`, `Participant`, `PARTICIPANT_INPUT_BLOCKED`, and `withParticipantInputBlocked`.
3. Replace `P.promiseKeyPress(...)` with `promiseKeyPress(...)`.
4. Replace `P.onKeyPress(...)` with `onKeyPress(...)`.
5. Keep `PButton`, `PButtons`, and `PKey` markup if it still fits the task.
6. Replace `EDelay` with `EPage :duration`.
7. Replace `EButtons`, `EKey`, and `EWait` with explicit `EPage` markup.
8. Add explicit semantic logging for choices, trials, survey responses, and task events.
9. Add explicit `animating`, `ready`, or phase guards for inputs that should be blocked during transitions.
10. Remove playback routes, links, and custom playback-dependent code.
11. Move any custom `EpochView` imports or assumptions to `EpochOutline`, `EpochControls`, or project-specific tooling.
12. If project developer pages should appear in the top nav, add them through `navPages` in `epoch.config.ts`.
13. Run `bun run typecheck`.

## Commits Included

Core submodule:

- `2cab2ae playback: remove playback page`
- `d414d4c participant: remove useParticipant abstraction`
- `b1b3154 epochs: simplify page primitives`
- `1d6748a NEW: ENavigableSequence (prev EInstructions)`
- `f0804af EPage: add slot state`
- `e8e0e2e add navPages to epoch.config`
- `a9ff185 add ConditionView`
- `5f3dffa rm EpochView`
- `02e39ac refac: useUrlParam for ConditionView and EpochOutline`

Template:

- `631c5e1 participant: update core submodule`
- `cee75f7 demo: add key press example`
- `f5ce5b6 core: ENavigableSequence`
- `2cec00c core: EPage slot`
