# Experiment Project Guide

This is the canonical starting point for agents working on experiment projects built from this core.

Commands and code paths are relative to the experiment repository root unless explicitly stated otherwise. Markdown links are relative to this guide. Keep each experiment's root `AGENTS.md` as an explicit instruction to read this guide, followed by any project-specific rules.

## Repository layout

This is a Nuxt 3 experiment app that extends the template layer in `core/`.

- Project-specific experiment code lives at the repository root, especially `components/` and `epoch.config.ts`.
- `core/` is owned by the template. Do not edit files under `core/` unless the user explicitly asks for a template-layer change.
- Never touch the `data/` directory.
- Architecture decision records for the template layer live in [`core/docs/adr/`](../adr/) (numbered `NNNN-title.md`). Record non-trivial template-layer design decisions there, and consult them for background.
- Keep [`core/CHANGES.md`](../../CHANGES.md) up to date with changes to core's external behavior and required downstream updates, including top-level configuration changes. Exclude internal refactoring, documentation, and example/demo changes.

## Before editing

- When the lab manager asks for a setup block (for example, “Make me a setup block”), follow [Prepare a student handoff](student-handoff.md). Ask for the project name and researcher contact email if either is missing, and wait for the reply before provisioning the fresh student Firebase project. An explicit documentation-only or dry-run request takes precedence.
- When a student supplies a setup block, follow the [student setup instructions](../../../README.md#create-your-experiment).
- Find the closest implementation in [`internal/examples/README.md`](../../internal/examples/README.md) and copy its structure. The examples are live and type-checked.
- Use the human-facing concept docs at `/docs` when you need explanation rather than an implementation pattern.
- For microphone recording or Firebase file uploads, read [audio and files](audio-and-files.md) and copy the live audio example. Storage needs an optional per-project setup before live collection.
- When you need to confirm that something actually runs, drive `/dev` in a browser: see [`browser-testing.md`](browser-testing.md) for jumping straight to an epoch by URL and verifying against the event log.
- For automated exploration, visual checks, and compiled replay, use the [experiment testing tools](../../testing/README.md).
- If Nuxt dev or build stalls during transformation, check the installed esbuild executable using [`esbuild-executable-hang.md`](../hiccups/esbuild-executable-hang.md).

## Development commands

Use Bun from the repository root.

- Install dependencies: `bun install`
- Start dev server: `bun run dev`
- Typecheck: `bun run typecheck`
- Build: `bun run build`

Run `bun run typecheck` after all edits. When a change needs to be seen running rather than just type-checked, verify it in the browser following [`browser-testing.md`](browser-testing.md).

The user usually has a dev server already running. Before starting one, check whether the dev server is already serving (its port is set by the `dev` script in `package.json`) and reuse it. If nothing is running and browser verification is needed, start the dev server yourself. Never kill a dev server you did not start, and never use a broad `pkill -f "nuxt dev"` / `pkill -f "bun run dev"` — it cannot tell the user's server from yours.

## Core rules

- **The epoch model.** An experiment is a tree of epochs. Branch epochs (`ESequence`, `ERepeat`) compose; leaf epochs (`EContinue`, `EPage`, custom components) run one at a time. A leaf ends itself by calling `done()`, which hands control back to its parent.
- **Composition rules.** Every direct child of an `ESequence` or `ERepeat` must be an epoch component, and an epoch component must sit inside an epoch. Presentational markup may surround epochs inside a branch and stays mounted across steps.
- **Represent repetition with `ERepeat`.** Do not use Vue `v-for` to expand repeated epochs in the experiment timeline. Build block or trial data up front and index it with the repeat's `step`. When one repeated block contains multiple sequential epochs, nest an `ESequence` inside the `ERepeat`. See [`StudyExample.vue`](../../internal/examples/StudyExample.vue) and [`epoch-repeat-structure.md`](../hiccups/epoch-repeat-structure.md).
- **A trial is a component.** Anything beyond “show this, then continue” is a custom component with module-level params, event loggers, and data views plus per-instance epoch and control-flow state. See [`StroopTrial.vue`](../../internal/examples/StroopTrial.vue).
- **Call `useEpoch(...)` before composables that depend on epoch context.** Epoch names must not contain hyphens.
- **Log semantic events densely** with declared, typed loggers. Record both participant interactions (responses, choices, clicks, and task-relevant movement) and experiment-driven events (stimulus onset/offset, phase and block transitions, feedback, and reward changes). Include the stimulus and task state needed to interpret each event, so the stored stream reconstructs what the participant experienced. Automatic `participant.*` events are for debugging, not the data record; explicitly log semantic task events even when the input primitive also logs the interaction.
- **Use `useLocalAsync()` for delays and registered async work** so pending work cannot fire into an unmounted component.
- **Gate input during transitions.** The template does not block input automatically.
- **Randomize data, not control flow.** Build and shuffle data arrays up front, then index them with `ERepeat.step`. Use ordinary conditional rendering only when experimental structure genuinely branches on a condition.
- **Naming.** `E*` names epoch components and `P*` names participant-input components.

## Code and data conventions

- Keep code simple, concise, and modular. Prefer existing project and template conventions over new abstractions.
- Use Vue single-file components with `<script lang="ts" setup>` for per-instance component logic when practical. Keep module-level parameter definitions, event loggers, and data views in a normal `<script lang="ts">` block.
- Vue/Nuxt framework APIs and file-based components are autoimported; compiler macros such as `defineProps` stay unchanged. Explicitly import every other function and type from its owning module, including core helpers, project helpers, VueUse APIs, and named SFC exports. See [imports.md](imports.md).
- Define experiment parameters with `defineParams` and pass per-instance overrides through `params` props.
- Keep declared event payloads typed and place `declareDataView(...)` transforms near the component or module that owns the event shape.
- Preserve compatibility with existing raw and session data when changing event schemas or exported columns.
- Use standard UnoCSS classes for simple styling and scoped CSS for complex stimuli. See [styling.md](styling.md) for the shared configuration, button variants, and dynamic classes.
- Do not change Prolific, Firebase, PostHog, or other deployment configuration unless the task explicitly requires it.

## Deployment and agent tools

Before deploying or preparing recruitment, read [the operations guide](../../operations/README.md). From the project root:

- `bun run ops -- deploy inspect` reports the target, source identity, and posted-version warnings.
- `bun run ops -- deploy run` deploys static Hosting, verifies the live build, and records its SHA/version.
- `bun run ops -- --help` lists study/review draft and read-only investigation commands. Study publication and participant actions/payments remain final researcher actions in the web UI.

If Create New Study reports **Not deployed**, **Git worktree is not clean**, or different current/deployed commits, follow [Fix a deployment mismatch](../../operations/README.md#fix-a-deployment-mismatch).

Set a real researcher `contactEmail` in `epoch.config.ts` before production build/deployment. Treat `version` as a participant-procedure/data-cohort identifier. During development, keep the version planned for the next cohort, including pre-posting bugfix deployments; keep it for unchanged-code recruitment batches. Increment it when changing the procedure or analysis after posting a study or collecting participant data under that version. A posted version with a different commit produces a strong warning. Review the diff before using `--allow-version-reuse`; report the reason for keeping the version. Missing publication history (e.g. studies posted outside this dashboard) requires a manual check.

For browser exploration and recorded replay, start with [the testing guide](../../testing/README.md) and `bun run test:experiments help`.
