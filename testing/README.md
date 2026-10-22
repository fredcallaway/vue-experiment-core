# Automated experiment testing

Use a testing agent to discover the real participant path and judge the first set of screenshots. Compile that reviewed run into mechanical replay. Subsequent runs check behavior, layout, and pixels without model calls; a mismatch produces an evidence packet and can invoke a testing-agent process.

## Setup

From the experiment repository root:

```sh
bun install
bunx playwright install chromium
bun run test:experiments help
```

The last command runs the CLI in Node (tested with Node 22); `bun core/testing/cli.mjs` also forwards to Node. Browser processes and integration tests use Node because concurrent Playwright runs under the installed Bun 1.2.10 showed browser-transport and fixture-listener failures during verification; the matching Node runs passed. Reuse the experiment's existing dev server; the tools do not start or stop dev servers. Browser contexts use fresh storage, allow local `/dev` and `/examples` routes, block external HTTP and WebSockets, and block local write requests. They never test production database persistence. Use `runtime.seed` only with the current core's development-only `testing` flag; unseeded exploration also works against older consumers.

## Record an agent run

```sh
bun run test:experiments agent start --url http://localhost:3030/dev --seed regression-1 --scope full --label 'Whole experiment' --output .experiment-tests/session
bun run test:experiments agent observe --session .experiment-tests/session/session.json
bun run test:experiments agent act --session .experiment-tests/session/session.json --json '{"action":"click","target":{"role":"button","name":"Continue"}}'
bun run test:experiments agent checkpoint --session .experiment-tests/session/session.json --json '{"name":"instructions"}'
```

Each observation returns a screenshot path, accessibility text, visible controls, layout findings, recent events, and current epoch when the core bridge is available. Read the screenshot with the agent's image tool. Actions use real browser input. The session records both successful and failed attempts; a failed action prevents compilation. Use source inspection to understand custom keyboard/canvas controls, then exercise them through the browser.

Finish with actual terminal assertions. Finishing captures the final screen automatically:

```sh
bun run test:experiments agent finish --session .experiment-tests/session/session.json --json '{"summary":"Completed the tested path","terminal":[{"kind":"event","name":"experiment.complete","count":1}],"masks":[{"selector":".main-content pre","reason":"Development completion dump contains volatile timestamps; completion and trial events are asserted separately"}]}'
```

Only include a mask when that exact visible element exists and the exclusion is justified. Read every checkpoint image, inspect relevant event payloads, and explicitly approve the clean candidate:

```sh
bun run test:experiments agent compile --session .experiment-tests/session/session.json --json '{"reviewer":"testing-agent","rationale":"Reviewed checkpoint images, the terminal view, and trial data invariants"}'
bun run test:experiments agent stop --session .experiment-tests/session/session.json
bun run test:experiments test .experiment-tests/session/baseline/baseline.json --output .experiment-tests/replay
```

The baseline bundle includes its exact trace, browser environment, reviewer rationale, checkpoint structure, and screenshot hashes. Copy the whole bundle to preserve its relative image paths. No failed test automatically changes it. See [the session protocol](agent/README.md) for delayed actions, failures, and daemon lifetime.

## Focused sections and suites

Discover actual epoch ids using the [browser guide](../docs/guide/browser-testing.md). Start a recording at `/dev?jump=<observed-id>` with `--scope section --label 'Trial response'`. The jump only prepares the section; the recorded test must use real controls. Full traces should start at the beginning and assert actual completion.

The checked-in [examples](examples/) exercise the template, bandit, prediction, graphnav, and risky-choice. They are recorded navigation programs, not approved baseline images. Run one to produce fresh reviewable evidence:

```sh
bun run test:experiments run core/testing/examples/prediction-keyboard.json --project ~/projects/prakhar-ac/prediction-task --output .experiment-tests/prediction
bun run test:experiments compile .experiment-tests/prediction --reviewer testing-agent --rationale 'Reviewed every image and response event' --output .experiment-tests/prediction-baseline
```

Keep the example URL/viewport aligned with the intended running project. A suite JSON contains `{"baselines":["prediction-baseline/baseline.json","bandit-baseline/baseline.json"]}` with paths relative to that file. Run `suite suite.json --jobs 2`; use `--section trial` to match a trace id or scope label, or `--section full` to select full traces. Separate seeds, conditions, viewport sizes, and normal/fast timing need separate reviewed runs. Fast mode changes some experiments' trial counts as well as delays; it does not validate nominal-duration behavior.

## Implementing and testing agents

Give the testing agent the expected behavior, local URL, affected section, relevant event contract, and the source revision to test. Let it choose actions and inspect evidence independently. It returns `handoff.json` and `handoff.md` with observed failures, screenshots, reproduction trace, and coverage. The implementing agent fixes reported defects, then asks for a fresh test. Keep the original failing artifacts.

A failed mechanical test writes `handoff.json`, screenshots, pixel diffs where available, and `run.json`, then exits 2. To launch an agent automatically, supply an executable and arguments as JSON:

```sh
bun run test:experiments test baseline/baseline.json --review-command '["/path/to/testing-agent","--review-stdin"]' --output .experiment-tests/review
```

The process receives the handoff JSON on stdin. Its stdout/stderr and exit status are saved in `agent-review.json`; its exit code does not turn a failed mechanical test green. The adapter is model/provider independent. Without a command, the caller should delegate the handoff to a testing agent in its own orchestration environment. There is no hidden model call, API key requirement, or automatic baseline approval.

## What the checks establish

- **First-run geometry:** clipped text/media/controls, unreachable offscreen controls, hit-test occlusion, missing roots, broken images, and incomplete audits. Nested scroll containers and disabled/hidden elements are handled explicitly.
- **Behavior:** actual input receipts, required visible/text/count states, semantic event counts and payload subsets, browser errors, and experiment error events. Define assertions for the scientific data contract; generic DOM discovery cannot infer it.
- **Visual regression:** two consecutive stable screenshots, then comparison with a reviewed image. The whole viewport is compared, including content outside the experiment root. The Nuxt developer widget is explicitly excluded from comparison; an unstyled screenshot is retained. At most 20 pixels may differ by one channel level to accommodate observed raster rounding; the report records that allowance. Larger color differences or more changed pixels fail, including subtle changes over a stimulus area.
- **Compilation:** requires a clean completed run, every action receipt, a final checkpoint, intact image evidence, and explicit reviewer attribution. Narrow masks require a reason, retain geometry, and never suppress layout auditing. Oversized masks and masks hiding controls are rejected.

These checks cover the visited path and captured states. They do not establish that an unseen condition, untested viewport, transient animation frame, or unasserted scientific relationship is correct. Continuously changing screens may remain agent-only. A stable image can already be wrong; reviewing initial images and data is essential. Screenshots are environment-specific, and a browser/environment change requires review. Old consumer RNG can vary between runs; any masks used to permit comparison explicitly reduce coverage.

## Validate the testing tools

`bun run test:testing` runs browser isolation/session/contract tests, injected visual faults, replay mutation tests, and an independent adversarial suite. `bun run typecheck` checks the Nuxt integration. [Evaluation notes](EVALUATION.md) separate synthetic checks, real experiment runs, timings, and unresolved findings.

The implementation uses Playwright [network routing](https://playwright.dev/docs/network) with service workers blocked, separate WebSocket routing, and [screenshot comparison](https://playwright.dev/docs/test-snapshots). It leaves animations running during observation and fails unstable checkpoints instead of changing the task's timing to obtain a screenshot.
