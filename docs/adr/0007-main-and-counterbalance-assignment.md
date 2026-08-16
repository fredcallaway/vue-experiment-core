# ADR 0007: Separate main and counterbalance assignment

- **Status:** Accepted
- **Date:** 2026-08-16
- **Scope:** `core/` template layer, `simplified` branch
- **Relevant files:** `core/utils/conditions.ts`, `core/composables/useCondition.ts`,
  `core/internal/docs/DocsConditions.vue`

## Context

`useConditions().choice()` decodes one assignment number as a mixed-radix Cartesian product. The first declared
condition changes fastest, so all of its values are assigned before the next condition changes. This is useful for
primary experimental conditions: a short recruitment prefix reaches each main condition as quickly as possible.

The same order is less useful for counterbalance variables. With treatment `[control, treatment]`, task order
`[AB, BA]`, and response side `[left, right]`, ordinary enumeration assigns both treatment groups to `AB + left`
before advancing. If recruitment stops before the full Cartesian design, nuisance variables can be poorly balanced.

Main and counterbalance conditions also serve different purposes. Main conditions are experimental comparisons;
counterbalances distribute nuisance choices such as order, side, or mapping. Treating both as an undifferentiated
object makes the desired nesting implicit in declaration order.

## Decision

Add `useConditions().assign({ main, counterbalance })` and the pure
`getConditionsForAssignment(assignment, design)` helper.

Assignment has two levels:

1. Main conditions use the existing mixed-radix enumeration and form the inner loop.
2. A counterbalance combination is held fixed for one complete pass through the main design.

Counterbalance combinations still cover their full Cartesian product. Their order is chosen greedily: at each step,
select the unused combination that minimizes the worst marginal spread and then the total marginal variance across
counterbalance variables. Original Cartesian order is the deterministic tie-break.

For two treatment levels and two binary counterbalances, the first counterbalance blocks are `AB + left`,
`BA + right`, `AB + right`, and `BA + left`. Each block contains both treatment levels before the next block begins.

`getConditionAssignmentCount(design)` returns the complete cycle length. Both helpers validate that assignments are
non-negative safe integers, every condition has at least one value, and keys do not occur in both roles.

Pinned conditions are removed from their role's active assignment space, preserving the existing developer-UI
behavior. Existing `choice()` and `permute()` behavior remains available for compatibility.

## Consequences

- Main and counterbalance conditions are uncorrelated after every complete pass through the main design.
- Counterbalance marginals are kept as balanced as possible at block boundaries without changing main-condition order.
- Replacements remain reproducible because assignment is a pure function of the numeric assignment ID and design.
- Documentation can generate assignment tables with the production helper instead of hard-coding expected rows.
- Projects should use `assign()` when they need the distinction. Existing projects are not silently remapped.
- Changing condition keys, values, roles, or order changes the mapping from assignment IDs and should accompany a new
  experiment version, as with the previous condition API.

## Alternatives considered

### Enumerate every condition in one Cartesian product

This preserves the old implementation but gives later counterbalance dimensions poor prefix balance.

### Assign each counterbalance independently from the participant index

Independent modulo schedules can correlate with main conditions when factor sizes share divisors. Random hashing only
offers probabilistic balance and makes the resulting order harder to inspect.

### Choose a counterbalance independently for every participant

This can improve participant-level marginal balance, but counterbalances can then correlate with main conditions in a
partial sample. Holding one counterbalance fixed across a complete main pass makes the intended nesting explicit.
