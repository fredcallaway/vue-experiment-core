# Simplified Template Migration Notes

This branch simplifies the template by removing playback-specific infrastructure and the generic participant event abstraction. The goal is to make experiment code easier to understand and maintain while keeping the common `PButton`, `PButtons`, and `PKey` component names available for compatibility.

## Summary

- Removed the playback page and playback controller UI from `core`.
- Removed `useParticipant.ts` and the `participant.*` event bus/logging abstraction.
- Kept `PButton`, `PButtons`, and `PKey`, but they no longer log `participant.*` events.
- Moved keyboard response handling into `core/utils/keyPress.ts`.
- Removed template-managed participant input blocking; projects should block input explicitly in task code, usually with an `animating` or phase-state guard.
- Kept `usePButton`, but rewrote it to use a local event controller instead of `useParticipant`.
- Simplified epoch primitives by removing `EButtons`, `EKey`, `EWait`, and `EDelay`.
- Added `duration` to `EPage` for fixed-duration pages.
- Added slot-local `state` to `EPage` for simple reactive page state.
- Replaced `EInstructions` with `ENavigableSequence`, a sequence wrapper that lets users move between pages.
- Added optional `navPages` config for custom top-level developer navigation links.
- Added a condition inspector that can view and pin registered `useConditions` choices from the developer UI.
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

Those responsibilities are now split or removed.

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

`PButton`, `PButtons`, and `PKey` no longer log automatically.

Use semantic task logs instead:

```ts
logTrial({
  choice,
  rt,
  reward,
})
```

This is intentional. Generic automatic logs like `participant.click` gave a false sense of data coverage and were easy to bypass with regular buttons or custom UI.

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
