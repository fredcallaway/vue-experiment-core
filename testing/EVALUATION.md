# Experiment testing evaluation — 2026-10-22

Five parallel agents developed and challenged visual inspection, replay compilation, persistent testing-agent sessions, and real-experiment coverage. The resulting workflow combines source-informed exploration with reviewed mechanical replay. Timings below are local Chromium runs on macOS arm64; they are observations, not performance guarantees.

## Strategies compared

| Strategy | Observed strengths | Observed limits |
| --- | --- | --- |
| Generic accessible-control discovery | Found risky-choice A/B responses without source knowledge | Stalled at prediction and bandit keyboard trials and graphnav's custom pointer target |
| Source-informed testing agent | Completed those real input paths and the full template; reviewed initial images and semantic records | Initial exploration and review use agent time/tokens; coverage still needs deliberate conditions and viewports |
| Geometry inspection | Detected clipped/offscreen/obscured controls and bad initial screenshots before a baseline existed | Cannot infer stimulus meaning, colors, or arbitrary canvas correctness |
| Semantic assertions | Detected missing/wrong records even with unchanged images; checked actual completion | Only named event fields/invariants are covered |
| Compiled visual replay | Detected canvas-only and outside-root visual changes with unchanged DOM/event state | Requires stable captured states, reviewed exclusions, and a matching browser environment |

## Real experiment evidence

| Experiment | Tested scope | Result |
| --- | --- | --- |
| Template | Full fast run, 77 recorded steps, nine checkpoints, 20 choice trials, three click hits, nine survey responses, completion | Two sequential replays passed in 13.664 s and 13.526 s, with zero changed or suppressed pixels across all nine images |
| Template | Same full path at normal speed | Completed in 49.027 s; click timer showed 20 seconds rather than fast mode's four seconds |
| Bandit | Consent through three blocks, survey, and completion | Fast replay passed in 6.95 s; six trials, three summaries, three survey responses, one completion |
| Prediction | Normal-speed F response in a main trial | Replay passed in 1.99 s with one semantic response and two visual checkpoints |
| Graphnav | Custom circle click followed by natural timer completion | Fast section replay passed in 5.14 s; one hit, score and click count one |
| Risky choice | First main trial and feedback, including large-outcome gambles | Correctly escalated clipped Next controls, including at a 1280×900 viewport |
| Responses example | Actual testing-agent session compiled into mechanical replay | Passed in 0.909 s |

Bandit's independent investigation also checked arm/position mapping, reward lookup, block-summary sums, and its actual declared data views: six trial rows, three parameter rows, three summary rows, and one survey row. Those relational checks are investigation evidence; the checked-in trace asserts its declared event counts and payload subsets. The normal bandit procedure has 350 trials, so its six-trial fast run does not establish nominal-duration correctness.

Existing consumer source code, core pointers, and research-data directories were unchanged. Their old cores lack isolated seeded sessions; the example traces therefore use unseeded sessions and document narrowly masked random/development fields. The current template's full trace uses a fixed session seed. No fixed clock was used for behavioral validation.

## Fault injection and tool verification

- Visual oracle: 26 fixture checks, including nested consent scrolling, initially clipped text and controls, occlusion, broken images, intentional hidden/disabled content, and incomplete-audit failure. Small-fixture inspection median 0.5 ms, p95 0.7 ms; real-page inspection roughly 1.6–4.9 ms.
- Replay contracts: malformed input, missing assertions, altered trace/evidence, event payload matching, bounded raster noise, substantive color mutation, and mandatory final screenshots.
- Browser scenarios: unchanged replay about 0.3 s on a small fixture; canvas-color mutation detected despite identical structure; missing event and no-op paths failed; runtime errors, unsafe masks, and unstable animation prevented approval. A finite 600 ms animation completed naturally before capture.
- Independent adversarial suite: 20 integration checks passed, covering bad initial baselines, same-picture wrong/missing events, outside-root visual losses, subtle stimulus color changes, terminal-screen gaps, unsafe masks/routes, full CLI compilation/replay, and failure-triggered agent dispatch. A review process ran exactly once after a failure and never after a clean run; its success exit did not approve a replacement baseline.
- Browser isolation: external HTTP, external WebSocket, and local POST probes reached no destination handler. Review-process timeout also terminated a process that ignored SIGTERM in about 1.5 seconds with a 0.5-second configured deadline and one-second cleanup grace.

The independent tests caught false passes during development: an unexamined final screen, cropping away participant content outside the root, oversized masks, and an overly permissive perceptual color threshold. These were corrected and revalidated. The final comparator allows at most 20 pixels with at most one level of RGBA difference; reports expose the suppressed count. A 21-pixel one-level change or any larger channel change fails.

Real full-template repetition exposed unsettled 300 ms navigation transitions. Waiting for finite animations to finish, without skipping or canceling them, removed that flake. Exact baseline/replay equality was then observed twice. Screenshots exclude only Nuxt's nondeterministic developer widget and explicit reviewed masks; unstyled images are retained.

Concurrent Playwright processes under the installed Bun 1.2.10 produced browser-transport failures and native fixture-listener refusal despite JavaScript reporting the listener open. The identical parallel suite passed under Node. Browser CLI/session processes and integration verification therefore use Node; Bun remains the project command runner and pure-test runner.

## Artifacts and limits

The local `.experiment-tests/` directory in the template checkout holds reviewed template/bandit/prediction/graphnav bundles, `suite.json`, suite reports, and copied evidence. These generated, environment-specific artifacts are ignored by Git. Checked-in traces live in [`examples/`](examples/README.md); tool validation is reproducible with `bun run test:testing`.

The risky-choice defect remains unresolved: an eight-outcome gamble partly clips Next inside the fixed experiment container even at 1280×900. This extends the previously documented minimum-window case and qualifies the earlier full-size passing report. Screenshots revalidated the defect; participant results were not regenerated or revalidated.

This evaluation covers Chromium, the tested paths, selected conditions, and captured states. It does not establish cross-browser coverage, exhaustive random/conditional branches, all intermediate animation frames, production backend persistence, or scientific invariants absent from explicit assertions. Replay uses no model calls. Agent token cost and alternative model costs were not instrumented.
