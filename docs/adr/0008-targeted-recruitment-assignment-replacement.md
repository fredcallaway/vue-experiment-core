# 0008: Version-aware targeted recruitment for assignment replacement

Status: Proposed
Date: 2026-09-10

## Context

This proposal records the design discussion from the referenced task, “Improve assignment replacement UI.” It is intentionally a proposal rather than an accepted implementation decision. The text below is copied verbatim from the agent’s final message; no implementation changes were made in that task.

## Proposal

The assignment number is a Prolific URL-slot ID, not a condition count. Each participant receives `assignment=N`, which the experiment deterministically decodes into conditions. In this experiment:

- `gen = assignment mod 8`
- `71 → gen 7`
- `250 → gen 2`
- `71: 1` currently means “create one additional place targeting assignment 71.”

For the current data, I don’t think you should manually add four places. The earlier study is 80/80 and the current study is only 398/400. Therefore:

- 2 places already remain open.
- 2 additional places are needed for the approved incomplete submissions.
- After posting those replacements, reopening the study should expose four places total.
- The expected condition mix is `gen 2 × 3` and `gen 7 × 1`, reaching 60 each if all four complete and nothing else changes.

My recommended UI is a modest “Targeted recruitment” editor:

1. Show existing open places separately from proposed new places.
2. Decode every assignment ID into its complete condition vector.
3. Prefill a comma/whitespace-separated input with the automatic suggestions: `71, 250`.
4. Permit manual additions and duplicates.
5. Before posting, show a confirmation like:

| Source | Assignment | Conditions | Places |
|---|---:|---|---:|
| Existing open | … | `gen=2` | 2 |
| Approved incomplete | 250 | `gen=2` | 1 |
| Approved incomplete | 71 | `gen=7` | 1 |

Then show the aggregate version-level projection:

- `gen 2: 57 completed + 3 open = 60`
- `gen 7: 59 completed + 1 open = 60`

For multiple condition variables, the confirmation should show both:

- each assignment’s joint condition vector, such as `treatment=A, order=BA, side=left`;
- marginal projected counts for every variable.

I would deliberately avoid automatically solving “balance all conditions.” With multiple variables, marginal deficits can admit several incompatible joint-cell allocations, and the software would need a policy about which balance matters. Letting the user or an agent choose IDs while the UI validates and previews their consequences seems safer and proportionate.

One implementation wrinkle: [`useConditions`](</Users/fred/projects/prakhar-ac/risky-choice-task/core/composables/useCondition.ts>) currently retains the flat options and current assignment, but not the original reusable main/counterbalance design. Accurate decoding on the dashboard therefore needs a small read-only decoder/design interface there; it should not infer conditions from observed sessions.

My recommendation is the version-aware preview above, rather than only the bare input. Does that scope sound right before I implement it? No files have been changed.
