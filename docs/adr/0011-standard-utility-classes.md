# Standard utility classes and shared button styling

Status: accepted, 2026-09-24.

## Context

The template and active experiments copied an UnoCSS configuration whose shorthand had diverged. In particular, `flex-center` meant a wrapping row in some projects and a column in others. Styling attributes also shared the same namespace as component props.

## Decision

Use standard UnoCSS classes for simple styling and scoped CSS for complex stimuli. Disable attributify and expand the non-button shorthand into explicit utilities. Preserve each project's existing geometry when migrating its code.

Keep button variants centralized in `core/uno.config.ts`, alongside the standard Wind4/icon presets, theme, and dynamic class safelist. Projects re-export this configuration, extending it only for deliberate local requirements. `PButton` continues to own interaction behavior and uses the shared button variants; native buttons can use the same variants.

## Consequences

Core styling updates have one definition instead of five copied configurations. Consumers must migrate their styling attributes and custom shorthand before adopting this change. Actual component props and native HTML attributes stay intact. Complete literal class maps make finite dynamic choices extractable; continuous stimulus values belong in bound CSS.

The authoring guide is [styling.md](../guide/styling.md); consumer migration requirements are in [CHANGES.md](../../CHANGES.md).
