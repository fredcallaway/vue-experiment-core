# ADR 0015: Retained children on phase reentry

- **Status:** Accepted
- **Date:** 2026-10-27
- **Scope:** Template epoch navigation

## Context

Display phases may keep epoch components mounted during a fade or through `persist` and `constant`. An outline jump can reenter a phase while its previous descendant components are still mounted. Creating the new phase marker alone leaves the current epoch at the marker because those components do not run setup again. A jump into their nested sequence then cannot find that sequence on the current ancestor stack.

## Decision

Each phase entry creates a fresh marker and leaves the old marker disabled, preserving the protection against delayed completion from a previous visit. A new marker adopts the previous visit's mounted children and updates their parent references. The current epoch becomes the deepest mounted descendant at the active indices. Component unmounting returns control through the epoch's current parent reference.

Parent child registries retain one entry per position and replace that entry when a newer instance mounts. This preserves the visited outline while ensuring retained-child lookup uses the current instance rather than an older unmounted instance.

## Consequences

Returning to a retained phase makes its nested epochs available to navigation without remounting the shared components. Explicit outline branch clicks target the first leaf to reset nested indices. Navigation preserves component-local state and does not restore a historical experiment snapshot. Raw event formats and consumer APIs are unchanged.
