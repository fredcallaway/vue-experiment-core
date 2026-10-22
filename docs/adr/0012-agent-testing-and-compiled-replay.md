# ADR 0012: Agent exploration and compiled visual replay

- **Status:** Accepted
- **Date:** 2026-10-22
- **Scope:** Local experiment testing
- **Supersedes:** [ADR 0004](0004-playwright-testing.md)
- **Implementation:** [`testing/`](../../testing/README.md)

## Decision

Use a source-informed testing agent to exercise real participant inputs and review initial visual/data evidence. Record its successful actions and explicit expectations as a strict trace. Compile only complete, reviewed runs into screenshot/structure baselines. Mechanical replay is the common fast path; any mismatch produces an agent handoff and never updates the baseline implicitly.

The browser harness runs against local development routes with fresh storage and blocked remote traffic. The development-only testing flag preserves existing session-seeded randomness while leaving the data writer in memory. A read-only bridge exposes epoch/event state. Tests cannot invoke epoch control methods through this bridge.

Checkpoint geometry checks detect faults even before a baseline exists. Pixel comparisons cover the viewport, including teleported content, while narrowly excluding the known Nuxt developer widget. A final visual checkpoint is required. Explicit masks represent reviewed exclusions and retain their geometry; layout checks still inspect masked content. Runtime, event, screenshot integrity, and browser environment failures prevent compilation or passing replay.

## Rationale

Timeline traversal establishes reachability but skips participant input and its effects. Generic accessible-button discovery stalls on the existing prediction/bandit keyboard tasks and graphnav pointer task. The testing agent can discover those affordances from instructions and source, while recorded real input retains the behavior under test.

A semantic-only trace misses canvas colors, occlusion, and visual regressions. Pixel-only comparison accepts a bad initial baseline and misses incorrect event payloads. Combining first-run layout checks, explicit data assertions, agent visual review, and pixel replay provides complementary evidence. The reviewed trace is a compiled artifact, so an experiment edit can trigger fresh agent exploration rather than requiring hand-maintenance of every navigation step.

Two stable screenshots do not certify scientific correctness or cover intervening animation frames. The tool records visited scope, timing mode, masks, and provenance rather than presenting a passing path as exhaustive experiment validation. Real backend persistence remains a separate test concern.
