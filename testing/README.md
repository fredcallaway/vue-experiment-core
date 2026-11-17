# Automated experiment testing

Use a testing agent to discover the real participant path and judge the first set of screenshots. Compile that reviewed run into mechanical replay. Subsequent runs check behavior, layout, and pixels without model calls; a mismatch produces an evidence packet and can invoke a testing-agent process.

## Setup

From the experiment repository root:

```sh
npm ci
npx playwright install chromium
npm run test:experiments help
```

The CLI, browser sessions, and integration tests execute under Node. Reuse the experiment's existing dev server; the tools do not start or stop dev servers. Browser contexts use fresh storage, allow local `/dev`, `/docs`, and `/examples` routes, block external HTTP and WebSockets, and block local write requests. They never test production database persistence. Use `runtime.seed` only with the current core's development-only `testing` flag; unseeded exploration also works against older consumers.

`node core/testing/debug-saving.integration.mjs` runs the real developer navigation and data writer against a dedicated in-memory database fixture. It starts and stops its own local fixture server, blocks external requests and filesystem data APIs, and checks session prompting, collisions, acknowledgments, failure/retry, pausing, Preview continuity, and URL/reload behavior. Screenshots and results are written to `.experiment-tests/debug-saving/`.

`node core/testing/data-preview.integration.mjs` runs the real Develop Data panel against isolated synthetic epochs and views. It checks deepest-name priority, output recency, CSV/JSON changes, manual pins, errors, metadata, reloads, and jumps without opening a database session. It owns its fixture server unless an existing fixture origin is supplied as the first argument. Evidence is written to `.experiment-tests/data-preview/`.

## Record an agent run

```sh
npm run test:experiments agent start --url http://localhost:3030/dev --seed regression-1 --scope full --label 'Whole experiment' --output .experiment-tests/session
npm run test:experiments agent observe --session .experiment-tests/session/session.json
npm run test:experiments agent act --session .experiment-tests/session/session.json --json '{"action":"click","target":{"role":"button","name":"Continue"}}'
npm run test:experiments agent checkpoint --session .experiment-tests/session/session.json --json '{"name":"instructions"}'
```

Each observation returns a screenshot path, accessibility text, visible controls, layout findings, recent events, and current epoch when the core bridge is available. Read the screenshot with the agent's image tool. Actions use real browser input. The session records both successful and failed attempts; a failed action prevents compilation. Use source inspection to understand custom keyboard/canvas controls, then exercise them through the browser.

Finish with actual terminal assertions. Finishing captures the final screen automatically:

```sh
npm run test:experiments agent finish --session .experiment-tests/session/session.json --json '{"summary":"Completed the tested path","terminal":[{"kind":"event","name":"experiment.complete","count":1}],"masks":[{"selector":".main-content pre","reason":"Development completion dump contains volatile timestamps; completion and trial events are asserted separately"}]}'
```

Only include a mask when that exact visible element exists and the exclusion is justified. Read every checkpoint image, inspect relevant event payloads, and explicitly approve the clean candidate:

```sh
npm run test:experiments agent compile --session .experiment-tests/session/session.json --json '{"reviewer":"testing-agent","rationale":"Reviewed checkpoint images, the terminal view, and trial data invariants"}'
npm run test:experiments agent stop --session .experiment-tests/session/session.json
npm run test:experiments test .experiment-tests/session/baseline/baseline.json --output .experiment-tests/replay
```

The baseline bundle includes its exact trace, browser environment, reviewer rationale, checkpoint structure, and screenshot hashes. Copy the whole bundle to preserve its relative image paths. No failed test automatically changes it. See [the session protocol](agent/README.md) for delayed actions, failures, and daemon lifetime.

## Focused sections and suites

Discover actual epoch ids using the [browser guide](../docs/guide/browser-testing.md). Start a recording at `/dev?jump=<observed-id>` with `--scope section --label 'Trial response'`. The jump only prepares the section; the recorded test must use real controls. Full traces should start at the beginning and assert actual completion.

The checked-in [examples](examples/) exercise the template, bandit, prediction, graphnav, and risky-choice. They are recorded navigation programs, not approved baseline images. Run one to produce fresh reviewable evidence:

```sh
npm run test:experiments run core/testing/examples/prediction-keyboard.json --project ~/projects/prakhar-ac/prediction-task --output .experiment-tests/prediction
npm run test:experiments compile .experiment-tests/prediction --reviewer testing-agent --rationale 'Reviewed every image and response event' --output .experiment-tests/prediction-baseline
```

Keep the example URL/viewport aligned with the intended running project. A suite JSON contains `{"baselines":["prediction-baseline/baseline.json","bandit-baseline/baseline.json"]}` with paths relative to that file. Run `suite suite.json --jobs 2`; use `--section trial` to match a trace id or scope label, or `--section full` to select full traces. Separate seeds, conditions, viewport sizes, and normal/fast timing need separate reviewed runs. Fast mode changes some experiments' trial counts as well as delays; it does not validate nominal-duration behavior.

## Implementing and testing agents

Give the testing agent the expected behavior, local URL, affected section, relevant event contract, and the source revision to test. Let it choose actions and inspect evidence independently. It returns `handoff.json` and `handoff.md` with observed failures, screenshots, reproduction trace, and coverage. The implementing agent fixes reported defects, then asks for a fresh test. Keep the original failing artifacts.

A failed mechanical test writes `handoff.json`, screenshots, pixel diffs where available, and `run.json`, then exits 2. To launch an agent automatically, supply an executable and arguments as JSON:

```sh
npm run test:experiments test baseline/baseline.json --review-command '["/path/to/testing-agent","--review-stdin"]' --output .experiment-tests/review
```

The process receives the handoff JSON on stdin. Its stdout/stderr and exit status are saved in `agent-review.json`; its exit code does not turn a failed mechanical test green. The adapter is model/provider independent. Without a command, the caller should delegate the handoff to a testing agent in its own orchestration environment. There is no hidden model call, API key requirement, or automatic baseline approval.

## What the checks establish

- **First-run geometry:** clipped text/media/controls, unreachable offscreen controls, hit-test occlusion, missing roots, broken images, and incomplete audits. Nested scroll containers and disabled/hidden elements are handled explicitly.
- **Behavior:** actual input receipts, required visible/text/count states, semantic event counts and payload subsets, browser errors, and experiment error events. Define assertions for the scientific data contract; generic DOM discovery cannot infer it.
- **Visual regression:** two consecutive stable screenshots, then comparison with a reviewed image. The whole viewport is compared, including content outside the experiment root. The Nuxt developer widget is explicitly excluded from comparison; an unstyled screenshot is retained. At most 20 pixels may differ by one channel level to accommodate observed raster rounding; the report records that allowance. Larger color differences or more changed pixels fail, including subtle changes over a stimulus area.
- **Compilation:** requires a clean completed run, every action receipt, a final checkpoint, intact image evidence, and explicit reviewer attribution. Narrow masks require a reason, retain geometry, and never suppress layout auditing. Oversized masks and masks hiding controls are rejected.

These checks cover the visited path and captured states. They do not establish that an unseen condition, untested viewport, transient animation frame, or unasserted scientific relationship is correct. Continuously changing screens may remain agent-only. A stable image can already be wrong; reviewing initial images and data is essential. Screenshots are environment-specific, and a browser/environment change requires review. Old consumer RNG can vary between runs; any masks used to permit comparison explicitly reduce coverage.

## Validate the testing tools

`npm run test:testing` runs browser isolation/session/contract tests, injected visual faults, replay mutation tests, and an independent adversarial suite. `npm run typecheck` checks the Nuxt integration. [Evaluation notes](EVALUATION.md) separate synthetic checks, real experiment runs, timings, and unresolved findings.

With a project dev server running, `node core/testing/main-content.integration.mjs http://localhost:<port>` checks that the development overflow outline responds to content growth, shrinkage, width changes, stylesheet resizing, and content replacement inside a fixed frame. It uses the isolated browser harness and writes screenshots to `.experiment-tests/overflow-warning/` by default; pass an output directory as the second argument to change it.

`node core/testing/docs.integration.mjs http://localhost:<port>` walks every Docs page using Next, audits layout, and checks scrolling and outline navigation. Screenshots and a page-by-page report go to `.experiment-tests/docs/` by default; pass an output directory as the second argument to change it.

`node core/testing/prolific-token-help.integration.mjs http://localhost:<port>` checks the token-help dialog's keyboard behavior, focus restoration, and layout at desktop and smaller sizes. All backend requests are fixtures and external traffic is blocked. Screenshots go to `.experiment-tests/prolific-token-help/` by default.

`node core/testing/prolific-empty-data.integration.mjs http://localhost:<port>` checks the study page before the first experiment session, with and without Prolific submissions, while loading, and as sessions arrive or disappear. All backend requests use fixtures and external traffic is blocked. Screenshots go to `.experiment-tests/prolific-empty-data/` by default.

`node core/testing/deployment-safety.integration.mjs http://localhost:<port>` checks contact configuration, posted-version acknowledgment, isolation from deployment bypasses, pre-posting/same-code reuse, and publication attribution to the current deployed build. Database/deployment operations use in-memory fixtures and external traffic is blocked. Screenshots go to `.experiment-tests/deployment-safety/` by default.

`node core/testing/deployment-build.integration.mjs` generates an isolated static fixture with synthetic deployment identity, serves it locally, and verifies saved session provenance and participant/dashboard completion-code agreement. The build is never uploaded; the browser uses an in-memory database and blocks external traffic. Evidence goes to `.experiment-tests/deployment-build/`.

`node core/testing/fatal-errors.integration.mjs` checks the shared fatal error page after plugin/configuration failures, invalid session IDs, the live deployment safeguard, and page setup exceptions. It checks original diagnostics, report copying, manual-copy fallback on narrow screens, and a healthy experiment control. Add `--production` to generate and test a local static build with synthetic build identity. Each run owns its fixture server, blocks external traffic and local API writes, and uses an in-memory database; nothing is deployed. Evidence goes to `.experiment-tests/fatal-errors/`.

`node core/testing/audio-data.integration.mjs` also checks chronological debug browsing across local and hosted sessions, redirects from legacy debug version links, and session-specific CSV/JSON exports. All data APIs are mocked; no participant files are read or written.

`node core/testing/preview.integration.mjs http://localhost:<port>` checks Develop/Preview switching, stable navigation and experiment state, query preservation, hover/click/keyboard outline access, cold Preview startup, reload/history, and worker isolation. Screenshots go to `.experiment-tests/preview/` by default; pass an output directory as the second argument to change it.

`node core/testing/outline.integration.mjs [screenshot-directory]` starts and stops its own isolated Nuxt fixture app. It checks cold-cache outline workers in Develop and Preview, active-parent restarts, nested sequences and 2×2 repeats, repeat-index badges, shared ancestor state, named phases containing a sequence, persistent child epochs spanning phases, interrupted animated transitions, cancellation of delayed completion after a jump, and subsequent successful completion. Assertions use real outline clicks and participant controls; snapshots are read-only. The fixture's Firebase settings are deliberately nonfunctional, the browser blocks external traffic, and the data writer must remain uninitialized. Screenshots, a checkpoint report, and the owned server's log go to `.experiment-tests/outline/` by default. This fixture includes a reduced version of the historical `EDemoPhases` structure committed shortly after `6ed0258`.

The implementation uses Playwright [network routing](https://playwright.dev/docs/network) with service workers blocked, separate WebSocket routing, and [screenshot comparison](https://playwright.dev/docs/test-snapshots). It leaves animations running during observation and fails unstable checkpoints instead of changing the task's timing to obtain a screenshot.
