# Hosting deployment verification

- Deploy Website and the deployment CLI retry live marker reads for up to 30 seconds after upload. The dashboard shows when it is waiting for the build. A verification timeout reports the expected and last observed deployment IDs.

# Session Data page

- Opening a session shows its loading state, identifies sessions missing from both Firebase and the local download, and explains read failures. An absent download is expected when browsing directly from Firebase.

# Version overview condition counts

- Each condition tally includes only sessions with a recorded value for that condition. The overall session count includes every session in the version.

# Prolific exclusion validation

- Study creation retries once when Prolific explicitly rejects nonexistent users in a participant blocklist. Only rejected IDs are removed from the outgoing request; valid exclusions and stored participant records are preserved. Other validation failures still stop creation.

# Explicit contact-check override

- Template/demo deployments can retain the starter contact placeholder with `bun run ops -- deploy inspect --skip-contact-email-check` and `bun run ops -- deploy run --skip-contact-email-check`. The opt-in skips contact validation for that invocation and its generated build, emits a warning, and preserves the other deployment gates. Direct production builds can opt in with `EXPERIMENT_SKIP_CONTACT_EMAIL_CHECK=1`. Contact validation remains enabled by default; no consumer-code or raw-data migration is required.

# Hosted researcher tools

- Production Prolific and Data pages show instructions for starting the local development server. Navigation links remain visible, and local development serves the full tools. This applies to direct study, version, and session links as well as each tool's main page. No consumer-code or raw-data migration is required.

# Prolific connection validation

- The connection form authenticates the API token before labeling it valid, including before a project has been selected. HTML and malformed API responses produce a diagnostic identifying the failed local endpoint and explaining how to check the development server; failed checks can be retried. Connection checks no longer log tokens. No consumer-code or raw-data migration is required.

# Firebase credentials across checkouts

- Project keys are stored per user at `~/.config/experiment-template/firebase/<project-id>/service-account.json` and selected using `firebase.config.json`. Fresh clones reuse the same private key. A valid old Git-metadata key is imported automatically when no shared key exists. Reconfigure with `bun run ops -- firebase-auth configure --key <file>` to rotate it across checkouts; running dashboards pick up changes without restarting.
- A saved matching project key always takes precedence; without one, shell credentials remain supported. Invalid or missing registered key files block operations with a repair instruction. Project-key calls still isolate cached human Firebase logins and clear inherited `FIREBASE_TOKEN`.
- Create New Study and `bun run ops -- firebase-auth status` expose the active credential source. Firebase CLI errors retain their diagnostic and source; shell permission failures suggest configuring a missing project key. No consumer-code or raw-data migration is required. Participant behavior is unchanged.

# Optional Firebase Storage configuration

Projects without the optional Firebase `storageBucket` field now typecheck correctly; Storage uploads still require a configured bucket.

# Fatal error reports

- Nuxt startup and fatal error screens now offer readable guidance, expandable original diagnostics, and Copy report with a selectable-text fallback. Reports include the page path and embedded build identity when available, omit URL queries and arbitrary error payloads, and work independently of experiment configuration and services. Reports are local and can be copied for investigation. Consumers with their own `error.vue` retain their override; no raw-data migration is required.

# Production homepage

- The production root URL now displays a participant wrong-link message and an explicit Open Developer Mode control leading to `/dev`. Local development still redirects `/` to `/dev`; participant and recruitment links continue to use `/exp` directly. No raw-data migration is required.

# Prolific URL joining

- Prolific base URLs are normalized without trailing slashes so recruitment and deployment-preview links use a single `/exp` path. Custom URL path prefixes are preserved; existing raw data needs no migration.

# Active Prolific study deployment check

- The web and CLI deployment paths check the linked Prolific project for studies with status `ACTIVE` before building and again before uploading. Confirm the studies shown in the web UI or pass their IDs with `--allow-live-studies`. Paused and awaiting-review studies pass the check. A failed check blocks deployment when a Prolific project is linked.

# Audio files in data views

- `useFirebaseStorage().uploadAudio(filename, recording)` returns an `AudioFile` after an acknowledged upload. Log or return that reference in a data view; its table cell offers Play/Stop and its exported value is a relative path to the downloaded file. Duration, MIME type, and size are stored with the file under the session's `other/files` index. Existing audio events and file metadata remain readable.

# Incremental audio downloads

- Saving live version data or a debug session downloads its missing audio files beneath `data/raw/<mode>/audio/`, preserving each recording's Storage path and filename. Complete local files are skipped without contacting Storage. Existing cached sessions are checked too, so recordings can be downloaded after their events were saved earlier. Interrupted downloads leave no completed file and are retried on the next save. Upload events and data-view paths remain unchanged; no consumer-code or raw-data migration is required.
- Recording lists and typed audio cells show a compact play icon with the duration. During playback, a seek bar uses the same space. Loading, playback, errors, and retry preserve the row and list geometry.

# Dataset versions and debug session exports

- Choose **Dataset version** in **Prolific → Create New Study**, then deploy. The selection is stored outside source code. Tracked builds embed their version, Git SHA, and deployment identity; participant metadata and completion codes use the loaded build. Existing `epoch.config.ts` version fields remain accepted but are ignored and may be removed. The CLI reads the saved selection or accepts `deploy inspect/run --version <name>`; select a version before the first deployment after adopting this core. Raw data needs no migration.
- All debug data uses a chronological session list, regardless of where it ran or any legacy version label. Debug saves write one session and its views under `data/processed/debug/<session-id>/`; live exports remain grouped by version. Existing debug version links open the session list. Local debug sessions omit version; tracked-build debug sessions retain deployment provenance in metadata.

# Synthetic sessions and recruitment

- The database participant blocklist skips sessions explicitly marked `synthetic: true` in their metadata. Live smoke tests should mark their session metadata as synthetic after the writer has stopped. Analysis-excluded real participants remain on the recruitment blocklist. Existing sessions need no migration.

# Prolific audio requirements

- Create New Study now offers microphone recording and audio playback requirements. These persist in the study draft and are sent to Prolific as `peripheral_requirements` when creating a study. Existing drafts with no selection keep no extra requirements; no consumer-code or raw-data migration is required.

# Balanced condition assignment

- `useConditions().assign({...})` is now the sole assignment API. Pass every factor and its possible values in one flat object; it returns the participant's assigned conditions. Replace `choice(...)`, combine partial declarations, flatten the former `{ main, counterbalance }` structure, and replace assigning `permute(...)` calls with an explicit factor of possible orders. `permutations(n)` remains a pure index-permutation helper in `core/utils/array.ts`.
- The schedule visits every full combination once before repeating. For consecutive assignment IDs starting at zero, each factor's level counts differ by at most one at every prefix. A constrained pairwise heuristic improves pair coverage without sacrificing that marginal guarantee. Pins reduce the active design; repeated complete calls and component remounts reproduce the same mapping.
- `getConditionsForAssignment(assignment, options)` and `getConditionAssignmentCount(options)` take the same flat object. The former `ConditionDesign` type is removed. Assignment mappings change: use a new procedure version when migrating a posted study or an existing participant cohort. Existing raw sessions and recorded condition values remain unchanged.

# Automatic Data preview selection

- In Develop, Data Auto prefers a whole-name match to the deepest current epoch or ancestor, ignoring case. Otherwise it follows the most recently changed table or JSON output, including edits to existing rows. Simultaneous updates retain the current Auto choice when possible; manual picks stay pinned. No consumer-code or raw-data migration is required.

# Debug saving indicator

- Develop and Preview now include a cloud indicator beside Tutorial. Choose a session ID with a fixed `debug` prefix to save the accumulated run and subsequent events. Activation waits at least 500 ms and for database acknowledgment; confirmed saving is green, actual save failures are red with retry, and routine queued events leave the indicator steady. The active menu opens the session or pauses saving; re-enabling resumes the same session. Reloading starts off unless a session ID or mode URL parameter enables saving. UI-generated IDs never enter the URL. No consumer-code or raw-data migration is required.

# Development session mode

- Develop always initializes debug sessions, including when participant or study URL parameters would otherwise infer live mode. Existing raw data and consumer code require no migration.

# Debug audio uploads

- Initialized debug sessions now upload files with the same authentication, acknowledgment, retry, and automatic indexing behavior as live sessions. Their Storage session directory starts with `debug.`, and uploaded objects include mode metadata. Existing live paths and Storage rules remain valid; uninitialized previews and outline jumps still return an explicit unsaved result. Custom recording components should require `result.saved` for every initialized session, rather than bypassing acknowledgment based on debug mode.

# Automatic Prolific URL validation

- `FIREBASE_DEFAULT` requires a single default Hosting site whose site ID matches `firebase.config.json`'s `projectId`. Prolific URL generation now throws an actionable error for a nondefault site, target alias, or multiple-site configuration. Set the study draft's `baseUrl` to an explicit HTTPS URL for another site or custom domain. Standard default-site setups and existing raw data require no migration.

# Audio recording and Firebase Storage

- Local playback recognizes loopback requests forwarded by Nuxt's development worker, which does not provide a native socket address. Direct server requests still use their socket address; no configuration or raw-data migration is required.
- Session and version Data pages now have an **audio** tab with on-demand playback, filtering, and retry. Successful uploads automatically queue a session file index. Existing upload-result events and fluency `audio_path` records remain readable; no raw-data migration is needed. Run `bun install` after adopting core to install the server authentication dependency.
- Researcher playback uses a loopback-only server endpoint and the configured project service-account key. Grant that account `roles/storage.objectViewer` on the configured bucket; participant Storage rules may continue denying reads. See [playback setup](docs/guide/audio-and-files.md#play-recordings-in-the-data-dashboard).
- Added `useAudioRecorder()` for microphone permission, recording, playback, and lifecycle cleanup, and `useFirebaseStorage().upload(filename, blob)` for acknowledged session-scoped file uploads. Uninitialized previews return an explicit unsaved result without contacting Firebase. Initialized debug and live uploads require an active session, sign in with Firebase Authentication as needed, and reject on failure. Recording components must await uploads before advancing; completion's event flush does not save Blobs.
- Storage is opt-in: configure a bucket and Anonymous authentication, copy `core/operations/storage.rules` into the project, register it in `firebase.json`, and deploy the reviewed rules as an administrator. See [audio and files](docs/guide/audio-and-files.md) and `/examples/audio`. Existing consumers and raw data require no migration.

# Mouse trace initialization

- Saved mouse trajectories discard their first sample to remove the tracker's synthetic initialization point. Coordinate and timestamp arrays remain aligned; existing raw recordings and their format are unchanged. No consumer-code migration is required.

# Prolific studies before the first session

- A published study's submissions table remains available when the live database has no participant sessions yet. The page explains that no experiment sessions have been recorded, and submissions without a matching session show missing data. No consumer-code or raw-data migration is required.

# Prolific credential refresh

- Changing the API token automatically clears and reloads workspace and project choices in the connection form. Responses from previous credentials are ignored. No consumer-code or raw-data migration is required.

# Persistent project Firebase credentials

- Configure a lab service-account key once with `bun run ops -- firebase-auth configure --key <file>`. Supported CLI and dashboard deployments automatically read the private project key and isolate cached human Firebase credentials, with no terminal exports or server restart needed. The key is validated against the configured project and kept in Git metadata outside tracked/public files. Projects using an administrator's existing CLI login continue to work until a project key is configured; no consumer-code or raw-data migration is required.

# Fresh-install type generation

- Installation and typechecking generate the standard `.nuxt` types expected by consumer `tsconfig.json` files. Tracked CLI/dashboard deployments select an isolated Nuxt environment and generate into `.nuxt/production`, keeping the running development server available. No consumer-code migration is required.

# Event-table session identity

- Epoch-start rows retain their session IDs in the session and version Events tables, including session links and session-ID filtering. Raw data and registered data exports are unchanged; no consumer-code migration is required.

# Deployment build isolation

- Tracked deployments generate into `.nuxt/production`, leaving the development server's `.nuxt` files intact. Generated files under Nuxt's `dist` alias are ignored by development watchers. The dashboard stays available while **Deploy Website** generates the site. Consumers inherit these settings from core; no code migration or raw-data change is required.

# Condition pinning

- Initial `condition.<key>` URL pins now retain their requested values, including after reloading a UI-selected pin. Pinned conditions take precedence over assignment; assignment cycles over unpinned conditions only, for `choice`, `permute`, and `assign`. No consumer-code migration or raw-data format change is required.

# Template deployment command

- The template's root package now uses `bun run ops -- deploy inspect` and `bun run ops -- deploy run` for deployment, without a separate `deploy` script. Existing projects can remove their `deploy` script and add `"ops": "bun core/operations/cli.ts"` if needed, or invoke `bun core/operations/cli.ts deploy run` directly. The dashboard's Deploy Website action is unchanged.

# Display phase transitions

- A newer display-phase request supersedes pending fades, including when returning to the currently displayed phase. Outline jumps during an animation now keep the visible phase aligned with the epoch. No consumer-code migration is required.
- Reentering a phase reattaches any retained epoch children to the new phase visit, so nested sequences remain navigable during interrupted fades and with persistent displays. The previous phase marker remains disabled. No consumer-code migration or raw-data format change is required.

# Outline branch navigation

- Clicking a branch name in the developer outline jumps to its first leaf, including when the branch contains the current epoch. Shared ancestors remain mounted; navigation does not restore arbitrary experiment state. Leaf clicks, collapse controls, and pinning retain their behavior. No consumer-code migration is required.

# Error diagnostics

- Error logging now imports its error predicate explicitly, allowing the original error to be recorded instead of throwing a missing-name error. No consumer-code migration is required.

# Data preview cells

- The developer Data panel limits CSV cell previews to three lines. Overflowing cells have a button that opens the full value beside the cell; Escape or clicking outside closes it. Exported values are unchanged. No consumer-code migration is required.

# Deployment configuration and posted-version safety

- Production builds/generation and all supported deployment entry points reject missing, malformed, or `fakeDomain.*` placeholder contact emails in `epoch.config.ts`. Set a real researcher email; development and typechecking still work with the starter placeholder.
- The deployment CLI and Prolific dashboard use the tracked static Hosting service, including clean/matching-submodule checks, hosted-marker verification, and atomic deployment tracking. The dashboard retains its selected-Firebase-project check. Database rules must be deployed separately with `firebase deploy --only database --project <project-id>`.
- Deployment inspection reports posted-version warnings using stored study `publishTime`, `version`, and SHA. Changed or unknown code under a previously posted version requires a dashboard acknowledgment or CLI `--allow-version-reuse`; the warning is still reported. Draft-only/pre-posting redeployments and unchanged-code batches do not warn. Existing raw study metadata remains readable; no consumer-code migration is required. See [the operations guide](operations/README.md) for coverage limits and commands.
- Existing-draft publication also checks version reuse and matching configured/deployed versions. Publication records the current deployed SHA rather than retaining the draft-creation SHA.

# Prolific token instructions

- The Prolific connection form now includes a link opening instructions for creating an API token. The dialog supports keyboard navigation, Escape, and returning focus to the help link. No consumer-code or configuration migration is required.

# Resizable developer panels

- Drag the divider between Data and Events to adjust their vertical split. Both panels retain a usable minimum height, and the split adapts when the browser window changes size. With the divider focused, use Up/Down to adjust it or Home/End to reach its limits. No consumer-code or configuration migration is required.

# Develop and Preview

- Replaced the Experiment navigation link with Develop and Preview. Both modes keep the navigation in the same position; Develop uses black text and Preview uses white text, with opacity indicating active and inactive links.
- Preview uses the participant frame’s dimensions and full-window centering. Hover over Outline to open the epoch outline and controls, or click to keep it open. The panel supports keyboard access, Escape, and outside-click dismissal without moving the experiment. Switching modes keeps the running experiment mounted.
- The Preview outline stays open when navigation disables a focused control, including Previous after returning to the first page. Moving keyboard focus outside closes it when the pointer is also outside; Escape and outside clicks still dismiss it.
- Use `?preview=1` for direct Preview links. Existing `?noDev` links remain supported; mode navigation converts them to the Preview flag. Hidden outline workers run in both modes and contain no developer chrome. No consumer-code or configuration migration is required.
- Shared URL parameters now stay synchronized with client-side navigation, preserving mode, condition, tutorial, and newly pinned epoch parameters across developer controls.

# Native browser zoom

- Removed the top-right developer preview zoom control and its saved `site-scale` setting. Use standard browser zoom shortcuts instead: `Ctrl + -` (`⌘ + -` on Mac) to zoom out. The small-window screen shows this tip in its centered message.
- Developer panels use CSS flex sizing, and window-size enforcement reads the browser viewport directly. No consumer-code or configuration migration is required.

# Acknowledged session saving

- `DataWriter.flush()` now returns `Promise<boolean>`: `true` means Firebase acknowledged the queued batch and session metadata. Offline, disabled, superseded, uninitialized/dummy, invalid-session, and rejected writes return `false`. Existing callers may continue ignoring the return value; custom completion pages should check it before reporting success or redirecting. No required consumer-code migration or raw-data format change.
- Pending live data, including an in-flight batch, stays in local recovery storage until acknowledgment. Flushes run sequentially, and acknowledgment only removes values that have not been replaced by newer queued updates. Rejected batches remain available for retry. Flush failures are reported to the console without queuing recursive error events that trigger further failed writes.
- Shared `ECompletion` waits for acknowledgment, retries when the browser comes online, and offers a retry button after an unsuccessful save. Unsaved Prolific submissions use the existing `DISCONNECTED` code; successful saves use `COMPLETED` (or `ERROR` for error completion). Uninitialized development runs still offer an explicit debug-database save, with reactive initialization and acknowledgment tracking.

# Contextual developer tutorial

- The top navigation includes an icon-only Tutorial toggle at the far right, colored pink when enabled. Navigation links, developer controls, and Prolific panels have pink highlights with explanations on hover or keyboard focus. The setting persists across navigation and reloads in the same tab; `?tutorial=1` also enables it. Repeated controls share one highlight. No consumer migration is required.
- Dashboard navigation fits the viewport independently of the page content's minimum width, keeping the Tutorial toggle visible on narrower panes such as Prolific and Examples.
- Tutorial controls share one reactive setting, so disabling tutorial mode clears every highlight even when browser storage notifications are unavailable. The per-tab saved preference is retained. No consumer migration is required.

# Development overflow warning

- The development frame's red overflow outline now updates when experiment content grows, shrinks, or is replaced inside a fixed-size frame. Observation runs only when the development outline is enabled. No consumer migration is required.

# Automated experiment testing

- Added agent recording, reviewed visual baseline compilation, mechanical replay, section/full-run suites, and failure handoffs in `core/testing/`. After adopting core, run `bun install` and `bunx playwright install chromium`. Add root scripts `"test:experiments": "node core/testing/cli.mjs"` and `"test:testing": "node core/testing/verify.mjs"`; add `node --test core/testing/browser.integration.mjs core/testing/agent/session.integration.mjs` after existing unit tests to include browser integration checks. Browser tooling uses Node (tested with Node 22), while project commands still run through Bun. Ignore `.experiment-tests/` in the project `.gitignore`. See [the testing guide](testing/README.md).
- In Nuxt development only, `/dev?testing=1&session_id=<seed>` keeps the seeded session and in-memory events without initializing database persistence. The testing harness also blocks external HTTP/WebSocket traffic and local write requests. A read-only `window.__experimentTest.snapshot()` exposes current epoch and recorded events when the testing flag is enabled; no experiment component changes are required. Older core consumers can be explored without a session seed, but deterministic seeded replay requires this core version.

# Firebase deployment project check

- The Prolific dashboard deploy action checks that the selected Firebase CLI project matches `firebase.config.json` before building or deploying, then passes that project explicitly to the CLI. Select the intended project with `firebase use` and update the full `firebase.config.json` before deploying a new experiment. The operations CLI uses the explicit project in `firebase.config.json`.

# Utility ownership and startup

- Import Remeda directly with `import * as R from 'remeda'`; the `R` re-export is removed. Import `chunkBy` from `core/utils/dataProcessing`.
- Core client plugins now install the global random override and compatibility polyfills. Keep project configuration initialization in `plugins/00.config.ts`; remove old app-side polyfill imports if overriding the app. The public random API and session seed remain unchanged.

# Prolific message refresh

- Message refresh now limits stale or missing cursors to a 29-day lookback within Prolific's 30-day API limit. Recent valid cursors remain incremental. Cached conversation history is merged rather than replaced, and the UI explains that older uncached conversations may be missing.
- The refresh timestamp advances to the request start only after all message reads and cache writes succeed, so failures retain the prior cursor and in-flight arrivals remain eligible for the next refresh. No consumer migration is required.

# Explicit helper imports

- Keep Vue/Nuxt framework API autoimports, compiler macros, and file-based component autoimports. Import all other functions and types explicitly from their owning modules, including VueUse and named exports from SFCs.
- Core now sets `imports.scan: false` and no longer enables `@vueuse/nuxt`. Remove project-level helper autoimport configuration and import VueUse APIs from `@vueuse/core`. Refresh dependencies with `bun install`.
- Replace helper imports from `#imports` with their source paths, for example `import { useEpoch } from '~/core/composables/useEpoch'`. Use `import type` for types. Component autoimports and component overrides continue to work; helper selection is now explicit at each import rather than determined by Nuxt layer scanning.
- Keep `plugins/00.config.ts` importing `epoch.config.ts` before the app loads. Core client plugins install the global seeded RNG and compatibility polyfills before experiment setup, including for custom app shells.
- See [the import guide](docs/guide/imports.md) for authoring examples and migration checks.

# Template Migration Notes

## Class-based styling

- Replace project `uno.config.ts` with `export { default } from './core/uno.config'` (retain deliberate project extensions). Core now owns the shared Wind4/icon presets, theme, safelist, and button variants.
- Styling attributes are replaced by standard `class` utilities; attributify is disabled. Convert both bare attributes (`mt-4`) and valued attributes (`flex="~ col"`) in project-owned components. Keep actual component props and HTML attributes.
- Removed non-button shortcuts and custom rules: expand `flex-center` with explicit flex direction/wrapping and alignment, `circle-N`/`square-N` with dimensions, `card-*` and `input`/`input-mono` with their utilities, and `tN`/`bN`/`rN`/`lN` with absolute positioning in pixels (N × 10). Expand scrollbar styling into standard arbitrary-property utilities. Check local configuration definitions before conversion because older projects used different flex directions and input spacing.
- Shared `btn-*` classes and `PButton` color/unstyled props remain supported. Button overrides must be passed through `class`, not styling attributes.
- Use complete class maps for finite dynamic colors; see `docs/guide/styling.md`.

## Summary

- Prolific submission bonus fields now keep enough width for three-digit cent amounts, including on small laptop screens.

- `useTimer(ms)` now applies the same fast-mode duration scaling as `useLocalAsync().sleep(ms)` when created or reset. Toggling fast mode does not rescale an active or paused countdown until reset. Fast mode is controlled by the developer toggle and session storage; the `fast` URL parameter is no longer read. Remove it from development links and use the toggle instead.
- The Prolific study list and detail page now share RTDB-backed review-draft state and cached full-study data. Opening a study always refreshes its Prolific data, and returning to the list reuses that refresh. The list also refreshes studies whose displayed status is not `COMPLETED` and uses displayed status consistently for cost visibility, preventing stale unpaid-bonus summaries from leaving a paid study marked `AWAITING REVIEW`.
- The agent CLI now supports `deploy inspect|run|reconcile` for tracked static Firebase Hosting deployments. It verifies a hosted build marker, preserves the existing `deployStatus`/`deploys` SHA and version fields, and supports retrying tracking after a successful upload. No experiment/client code or configuration migration is required for existing single-site static Hosting projects. Invoke `bun core/operations/cli.ts deploy run` directly, or use the existing `bun run ops -- deploy run` shortcut. See `operations/README.md`.
- Prolific study actions and creation now show structured HTTP 400 errors marked `interactive: true` as toasts using Prolific's detail message, including insufficient account funds. Full errors and stack traces remain in the console; unexpected errors retain the on-page error display.
- The Prolific submission table now supports sorting by every column. Status, completion code, data, and review action use triage priority rather than alphabetical order, with unspecified review actions first by default.
- Actions wrapped with `useAsyncRunner().wrap()` now reject on failure so `ActionButton` displays failure instead of success. Direct `run()` calls still return `null` on failure. `ActionButton` also handles rejection before resetting its loading state, avoiding an unhandled promise rejection during cleanup.
- Bumped `@posthog/nuxt` to `^1.7.79`. Earlier releases tried to process `.output/server` after a successful static SPA generation even though that directory does not exist, producing a false server-sourcemap error. Refresh the project lockfile after updating core.
- Added a local `core/operations/cli.ts` JSON interface for agent-safe study-draft reads/updates, review-draft reads/updates, and read-only submission investigation. The CLI intentionally cannot create/publish studies or execute participant actions/bonuses; those final Prolific actions remain in the web UI. Add `"ops": "bun core/operations/cli.ts"` and `"test": "bun test core"` to the top-level `package.json` scripts. See `core/operations/README.md`.
- The Prolific page now opens with an operational summary showing participant, cost, and study totals plus quick access to the first non-completed study. Prolific credentials and project setup now share one stable connection form: it appears inline when disconnected and opens from the summary when connected, with direct project-ID entry, workspace/project selection, and project creation available together.
- The Prolific study list now preserves its persistent cache when the Firebase-backed project ID first loads. This initialization previously looked like a project switch and cleared both the cached list and its completed-history cutoff on every page load, forcing the full history to rebuild. Changing to a different project still clears both values.
- The Prolific study table now shows average bonus and total cost between Reward and Places. Average bonus includes only full-data participants with a `COMPLETED` code and no manual bonus adjustment. Completed-study cost includes intended bonuses and Prolific's 33.3333% markup; studies in any other status show `???`. Derived summaries are cached across page loads; completed studies reuse the cache, while other studies show cached values immediately and refresh them in the background.
- A Prolific study reported as `COMPLETED` now remains `AWAITING REVIEW` in the dashboard while any participant has an unpaid intended bonus. Clicking Execute changes it to `PENDING` while the bonuses are processed; the detail page, study table, and next-study summary switch to `COMPLETED` only after every non-zero intended bonus has been fully paid.
- `nuxt generate` no longer runs PostHog sourcemap inject/upload unless `posthogConfig.sourcemaps.personalApiKey` starts with `phx_`. Placeholder keys such as `NULL` used to fail the generate. Set `sourcemaps.enabled` the same way in project `nuxt.config.ts` (`enabled: posthog.personalApiKey.startsWith('phx_')`); core also disables upload when the key is invalid.
- Added `docs/guide/browser-testing.md`, covering how to drive a running experiment from a browser agent: `?jump=<epochId>` to load straight into any epoch, `data-epoch-id` on outline rows (and the `epoch-outline:<route>` localStorage cache) to discover ids, and the event log as the verification surface.
- `getUrlFlag` now treats a flag's **presence** as true, matching the usual query-string convention: `?noDev`, `?noDev=`, and `?noDev=1` are all on. Previously only `1`/`true`/`yes` counted, so a bare `?noDev` or `?fast` was silently false. Explicit `=0`/`=false`/`=no` (case-insensitive) still turn a flag off, so `?fast=0` is unchanged. This affects `fast`, `noDev`, and `outlineWorker`, plus any project flags read through `getUrlFlag`; if a project relied on a valueless flag being ignored, that flag is now on.
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
- Consolidated condition assignment into `useConditions().assign({...})`, with all factors declared together and marginal-balanced assignment order. Pure helpers expose the same mapping for generated documentation and planning.
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
- Each session now has a single active client, enforced through the database. On initialization, `DataWriter` records a per-page-load client ID at `{mode}/client/{sessionId}` and watches it; if another client claims the session, the older client stops writing and `/exp` shows a deactivated-tab overlay. This replaces BroadcastChannel duplicate-tab detection and also covers incognito and cross-browser duplicates. Every flush now writes the full reactive `meta` object, and `_flush` refuses to write after the database listener marks the client as superseded.
- Fixed a `DataWriter` feedback loop where each flush updated `lastUpdateTime` and `inactiveTime`, causing the metadata watcher to schedule another flush indefinitely. Flush-managed metadata fields no longer trigger writes; participant-driven metadata changes still do.
- `/exp` no longer bypasses session validation and initialization errors in local development. Use `/dev` for ordinary development or a debug session (`?session_id=debugXXX&mode=debug`) to exercise `/exp` without a live participant session.

Note that `localStorage` is shared per origin, so a full quota is usually not the outline's doing. On one developer profile it was filled by `live/data/<sessionId>/` keys (~200 KB each) — the shape `getDBPath` produces, holding session event data. No current core code writes or reads them and Firebase is not responsible (its keys are all `firebase:`-prefixed), so their origin is unidentified; do not assume they are safely deletable without checking that those sessions reached the database.
- Removed demo modules from Nuxt's auto-import scan and lazy-load `/demo/<slug>` components from the demo manifest, so demo-only `declareDataView` calls are not registered by opening dashboards or the `/demo` index. See `core/docs/adr/0005-isolate-demo-imports-from-data-view-registry.md`.
- Fixed `DataWriter.metaMismatch` false positives when repeated debug sessions include empty local metadata objects, such as the `conditions: {}` object created by `useConditions()`, that Firebase omits when read back.
- Prolific submission review now treats sessions with a normal completion code and saved `completionTime` as full data even if `noReturnTime` was not recorded. Error and disconnected completion codes are not promoted by `completionTime` alone.
- Prolific review action and bonus overrides now sync through `studies/<studyId>/reviewDraft` in RTDB instead of browser-local storage. The review page applies per-submission and per-participant updates so browser and agent edits to different entries do not overwrite each other. Execute now snapshots the displayed actions and bonuses, runs them immediately, and reports progress and results through a toast instead of a confirmation modal. A study expected to complete is shown as `PENDING` until Prolific reports `COMPLETED` or two minutes pass.
- Toasts now appear in the upper-right corner instead of the lower-right corner.
- The shared Prolific study-creation draft now keeps listening for RTDB changes across dashboard navigation, ignores echoed remote updates, and disables editing and creation until its initial remote state has loaded. Deployment status also remains loading until both local and deployed SHAs are known, rather than treating two empty SHAs as deployed.
- Prolific assignment replacement now treats approved sessions with `SessionMeta.excluded === true` as incomplete, so they are counted when posting replacement places.
- The Prolific study page no longer crashes when an approved submission has no matching session metadata. It uses Prolific's per-assignment allocation counts to include these submissions in automatic assignment replacement when their assignments can be inferred unambiguously.
- Prolific study creation now has explicit participant exclusion options. The create-study filter panel can add a custom blocklist containing all valid participant IDs in `live/meta`, and can separately add Prolific's previous-studies blocklist. Both options are enabled by default in `studyDraft.exclusions`.
- Prolific study-list caching now records a completeness watermark. The first refresh backfills the full project study history; later refreshes only page back to the previous watermark while preserving the complete cached history. This makes Prolific's previous-studies blocklist use all cached historical study IDs without refetching the entire project on every study creation.
- Fixed Prolific study-list caching for projects with no studies. A successful empty refresh now records freshness instead of immediately refreshing again.
- The Prolific dashboard now requires a valid project ID before showing messages or studies. When setup validation fails, it shows API-token and project-ID instructions and can create a Prolific project through the Prolific API.
- The Prolific setup panels now use the dashboard's neutral panel styling, with unframed project selection controls.
- The Prolific study page's Add Places action now executes immediately, shows a loading toast while the API call is pending, and reports success after it resolves instead of asking for browser confirmation first.
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

In practice, `EContinue` is the dominant idiom in real experiments built on the template. `PContinue` has been **removed**; its only real advantage over `EContinue` — placing the affordance manually — is now covered by `EContinue`'s `#bottom` slot, which renders content below the button / space prompt.

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

The core `PEvent` type was removed. The event viewer retains `isParticipantEvent` in `core/internal/data.ts` for participant-event highlighting and filters.

The input primitives still emit automatic `participant.*` events directly, as described under Logging. These events and historical participant events remain available for inspection/debugging; analysis should use explicitly logged semantic task events.

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

Declare the complete factor set together:

```ts
const conditions = useConditions().assign({
  treatment: ['control', 'treatment'],
  taskOrder: [['A', 'B'], ['B', 'A']],
  responseSide: ['left', 'right'],
})
```

`getConditionsForAssignment(assignment, options)` returns the same assignment without Vue state, and `getConditionAssignmentCount(options)` returns the complete cycle length. Both take the flat options object. See `/docs` → Condition assignment for a table generated by the production helper.

Replace `choice(...)` with `assign(...)` and combine separate declarations. Flatten former `assign({ main, counterbalance })` calls. Replace assigning `permute(...)` calls with an array of possible orders in the same options object; `permutations(n)` in `core/utils/array.ts` generates index permutations when needed.

For consecutive assignment IDs starting at zero, marginal counts differ by at most one at every prefix, and every full combination appears once per cycle. Pairwise balancing is a secondary heuristic. The schedule is not a guarantee about the completed sample when assignments are skipped or participants drop out. Construction enumerates the full Cartesian grid, so use modest factorial designs.

The developer inspector reads `{ conditions, options, isPinned, assign }` from `useConditions()`. Pins are written to `condition.<key>` URL parameters and excluded from the active grid. Repeated complete declarations, including after remounts, remain supported. Migrating changes the assignment mapping; increment the procedure version when changing a posted study or an existing participant cohort. Existing raw data requires no migration.

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

1. Update the `core` submodule.
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
