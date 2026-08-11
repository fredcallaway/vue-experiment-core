# Experiment Project Guide

This is the canonical starting point for agents working on experiment projects built from this core. Project-level `AGENTS.md` files should point here instead of copying project-agnostic guidance.

## Before editing

- Read the project's own `AGENTS.md` for repository-specific constraints.
- Keep experiment code at the project root. Do not edit `core/` unless the task explicitly calls for a template-layer change.
- Find the closest implementation in [`internal/examples/README.md`](../../internal/examples/README.md) and copy its structure. The examples are live and type-checked.
- Use the human-facing concept docs at `/docs` when you need explanation rather than an implementation pattern.

## Core rules

- **The epoch model.** An experiment is a tree of epochs. Branch epochs (`ESequence`, `ERepeat`) compose; leaf epochs (`EContinue`, `EPage`, custom components) run one at a time. A leaf ends itself by calling `done()`, which hands control back to its parent.
- **Composition rules.** Every direct child of an `ESequence` or `ERepeat` must be an epoch component, and an epoch component must sit inside an epoch. Presentational markup may surround epochs inside a branch and stays mounted across steps.
- **Represent repetition with `ERepeat`.** Do not use Vue `v-for` to expand repeated epochs in the experiment timeline. Build block or trial data up front and index it with the repeat's `step`. When one repeated block contains multiple sequential epochs, nest an `ESequence` inside the `ERepeat`. See [`StudyExample.vue`](../../internal/examples/StudyExample.vue) and [`epoch-repeat-structure.md`](../hiccups/epoch-repeat-structure.md).
- **A trial is a component.** Anything beyond “show this, then continue” is a custom component with module-level params, event loggers, and data views plus per-instance epoch and control-flow state. See [`StroopTrial.vue`](../../internal/examples/StroopTrial.vue).
- **Call `useEpoch(...)` before composables that depend on epoch context.** Epoch names must not contain hyphens.
- **Log semantic events explicitly** with declared, typed loggers. Automatic `participant.*` events are for debugging, not the data record.
- **Use `useLocalAsync()` for delays and registered async work** so pending work cannot fire into an unmounted component.
- **Gate input during transitions.** The template does not block input automatically.
- **Randomize data, not control flow.** Build and shuffle data arrays up front, then index them with `ERepeat.step`. Use ordinary conditional rendering only when experimental structure genuinely branches on a condition.
- **Naming.** `E*` names epoch components and `P*` names participant-input components.

Run `bun run typecheck` after edits and use the project's prescribed build or browser checks when relevant.
