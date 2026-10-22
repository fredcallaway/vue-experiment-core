# Traces from existing experiments

These traces were derived from observed epoch outlines and real participant interactions on local experiments. Start each experiment's existing dev script, then run a trace from the template checkout:

```sh
bun core/testing/cli.mjs run core/testing/examples/bandit-full.json --project ~/projects/prakhar-ac/bandit-task --output /tmp/bandit-candidate
```

All examples use isolated `/dev` sessions. The browser runner blocks external HTTP and WebSocket traffic. Their older core versions do not support the new `testing` flag, so these traces omit session IDs and do not initialize a data writer. Their randomization varies between sessions.

| Trace | Local port | Scope and assertions |
| --- | --- | --- |
| `bandit-full.json` | 3033 | Consent, warning, all three blocks, three survey responses, and completion. Fast mode reduces each block to two trials. Requires three initialization events, six trial events, three summaries, no timeouts, three survey responses, and one completion. |
| `prediction-keyboard.json` | 3086 | One normal-speed main-task response using F. Requires exactly one semantic trial with `prediction: false`, and two choice boxes before input. |
| `graphnav-clicktest.json` | 3040 | Starts the click task, clicks its custom circle once, and waits for natural timer completion. Requires one hit and a final score and click count of one. Fast mode shortens the timer to four seconds. |
| `risky-choice.json` | 3819 | Selects A on the first main-task trial and checks feedback plus its semantic trial. This is a randomized diagnostic case: some gamble layouts expose an existing clipped Next button, including at 1280×900. Review those failures instead of adopting a baseline. |

The bandit full trace checks stable consent, survey, and completion screens. Its final checkpoint masks only the development-only raw-event dump, whose timestamps and random data vary. The prediction final checkpoint masks only the random bonus amount; reward rendering and correct-target feedback are outside that trace's coverage. Layout audits still inspect masked elements. These scoped checks complement visual review of randomized stimuli; they do not certify every trial, condition, or feedback state.

The normal bandit experiment contains 350 trials. The six-trial fast run verifies the full sequence of blocks and pages, but does not establish that the full-length schedule, deadlines, or timing are correct. For timing verification use normal speed and measure responses separately.

## Empirical comparison

On 2026-10-22, headless Chromium completed the source-informed fast bandit path in 6.34 seconds, including a 1.02-second local page load. The run also verified that each recorded arm matched its selected position, its reward matched that arm's reward array entry, and each summary total equaled the sum of the two observed rewards. The live declared data-view functions also produced six bandit rows, three parameter rows, three summary rows, and one survey row with the expected answers. These relational and data-view checks are in the accompanying investigation evidence, beyond the declarative trace assertions.

A generic DOM-role scan found no controls in the prediction, bandit, or graphnav click-target states. Source-informed actions successfully exercised all three: F for prediction, D/J and Space for bandit, and `.click-circle` for graphnav. The risky-choice A/B buttons were discoverable by role. Automatic affordance discovery therefore provides a useful starting point; keyboard-only and custom pointer tasks need instruction/source context or a testing agent.

The shipped CLI then captured candidates, preserved agent review rationales, compiled them, and passed fresh mechanical replays: bandit full fast in 6.95 seconds (34 steps, three checkpoints), prediction in 1.99 seconds (four steps, two checkpoints), and graphnav in 5.14 seconds (six steps, one checkpoint). A separate risky-choice run correctly requested agent review for its clipped Next button. These are local measurements, not guaranteed runtime bounds.

Normal-speed one-trial checks produced the expected semantic prediction and bandit records without browser errors. Repeated unseeded risky-choice loads produced different stimuli and screenshot hashes. A controlled fixed-clock visual-only investigation produced identical screenshots, but fixed clocks were not used in these behavioral traces because they invalidate Date-based reaction-time measurements.

Source snapshots used for the investigation: bandit `7d2c971`, prediction `7b4ff61`, risky choice `f9e4cdd`, graphnav `3a6a4b8a`; each used core `89a4081`. Traces must be re-observed after experiment structure or inputs change. These example files are not approved baselines; compilation requires reviewing the candidate's screenshots, layout findings, and event assertions.
