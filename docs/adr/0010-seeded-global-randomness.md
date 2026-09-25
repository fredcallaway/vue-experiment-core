# ADR 0010: Keep global randomness seeded

- **Status:** Accepted
- **Date:** 2026-09-24
- **Scope:** Experiment randomness
- **Relevant files:** `utils/random.ts`, `composables/useRandom.ts`, `plugins/01.random.client.ts`

## Decision

Keep the session-seeded global generator and the override of `Math.random`. Code in libraries may use `Math.random` without accepting an injected generator. Those calls must participate in seeded randomness so they do not silently undermine experiment replication.

Do not introduce a separate generator for every epoch. The additional stream/lifecycle machinery is not justified for the current design. Explicit named generators remain available for cases that need them.

## Consequences

Third-party calls to `Math.random` after the override consume the shared stream. Reproducing its output requires the same seed and draw order; adding or reordering calls can change subsequent draws. The override does not control other random sources or functions captured before initialization.

Experiment code should use the existing core random APIs. The client startup plugin installs the override after project configuration and before experiment setup. Importing the generator module does not install the override. `trueRandom` is the explicit escape hatch for randomness that should not consume the experimental stream.
