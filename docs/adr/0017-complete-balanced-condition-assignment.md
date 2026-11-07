# ADR 0017: Complete balanced condition assignment

- **Status:** Accepted
- **Date:** 2026-11-06
- **Supersedes:** [0007: Separate main and counterbalance assignment](0007-main-and-counterbalance-assignment.md)
- **Scope:** `core/composables/useCondition.ts`, `core/utils/conditions.ts`

## Decision

`useConditions().assign(options)` is the single assignment API. Its flat object contains every factor and its possible values. All factors must be available together to compute the schedule. Re-evaluating the same complete design is supported; component lifecycle and one-time initialization guards are unnecessary. Components can read the shared `conditions`, `options`, and `isPinned` state.

For consecutive assignment IDs starting at zero, each factor's level counts differ by at most one at every prefix. Every full Cartesian combination appears exactly once before the schedule repeats. This balances individual factors when recruitment covers only a small part of the complete grid. The former main/counterbalance distinction prioritized joint main-condition coverage instead.

## Balanced blocks

Represent a combination by its level indices. Repeatedly increment every index by one modulo that factor's level count. This partitions the Cartesian grid into disjoint cycles, each of length equal to the least common multiple of the level counts. Within a cycle, every individual factor visits its levels in round-robin order; at the cycle boundary every factor is exactly balanced. Concatenating disjoint cycles therefore preserves the marginal guarantee at every prefix and covers the full grid without repeats.

At each cycle boundary, score every unused starting combination by the largest resulting pair-cell count spread, followed by the sum of existing counts for the selected pair cells. The latter is equivalent to minimizing the increase in summed squared pair counts. Original Cartesian order breaks remaining ties. This is a deterministic pairwise heuristic, not an interaction-balance guarantee. It only selects a cycle and its starting point, so it cannot invalidate the marginal guarantee. Applying a pairwise tie-breaker independently at every row can exhaust combinations needed for later marginal balance.

Index schedules are cached by factor cardinalities and mapped to the current names and values. Construction enumerates the full grid and scores unused candidates at cycle boundaries; it is intended for modest factorial designs. Factor values and declaration order determine the reproducible mapping and belong to the experiment procedure version.

## Pins and existing records

Pinned factors are fixed before scheduling and excluded from the active grid. All-pinned and empty designs have one empty active combination. The shared returned object and session metadata contain both pinned and assigned values. Reassigning a complete design replaces previously registered factors rather than accumulating separate partial declarations.

Raw sessions retain their recorded assignment IDs and condition values. This change does not reinterpret or regenerate them. New experiments use the new mapping; downstream migration instructions are in `CHANGES.md`. The superseded implementation remains recoverable from the Git parent history, with a vault recovery record for possible future `assignWithCounterbalance` work.
