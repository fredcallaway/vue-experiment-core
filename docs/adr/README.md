# Architecture decision records

Numbered `NNNN-title.md`. An ADR answers **why the code is the way it is**.

## When to write one

Write an ADR when a decision constrains future code and its rationale is not recoverable from
reading that code — the alternatives rejected, the invariant being protected, the reason an obvious
simpler approach fails. The test is whether an agent about to violate the decision would need it.

Do not write an ADR for:

- a change whose reasoning is evident in the diff;
- implementation of a decision already recorded elsewhere;
- work that is still in flight, or a plan for work not yet done. That is a Task, not an ADR.

A long-lived `Proposed` ADR is a smell — it usually should have been a Task.

## Status

`Proposed` / `Accepted` / `Superseded`. Accepted ADRs are not rewritten as work continues; they are
superseded by a later ADR that links back.

## Relationship to Tasks and CHANGES.md

Three artifacts, no overlap:

- **ADR** — why the decision was made. Durable, lives with the code.
- **Task** — what is in flight and what is left. Episodic, lives in the vault under
  `Projects/Experiment Template/Tasks/`. A Task links to the ADR and states the one-line outcome;
  it never re-summarizes the reasoning.
- **`core/CHANGES.md`** — what downstream projects must do about it.

Record any given fact in exactly one of them.
