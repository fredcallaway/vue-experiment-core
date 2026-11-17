# 0019 — Independent fatal error page

Status: Accepted

## Context

Startup and page-setup failures can reach Nuxt’s fatal error screen before the experiment’s MainContent boundary mounts. Configuration and session validation can themselves be the failing dependency. An error view that imports the normal layout or experiment composables can fail again while trying to explain the original error.

## Decision

Provide the shared Nuxt layer’s `error.vue` through the existing framework fatal/startup path. Keep it independent of the application layout, experiment configuration, session/epoch state, database, and telemetry. A pure report formatter reads only explicit diagnostic fields, guards property access, bounds causes and output, and treats runtime/build context as optional.

Copying the displayed report is the handoff mechanism. If browser clipboard access fails, reveal and select the same report for manual copying. Rendering and sharing the report require no service acknowledgment or initialized participant session.

## Consequences

Changes to the fallback must preserve its independence, including its own styling. Shared report formatting must not import experiment composables or serialize arbitrary error payloads. Nuxt retains ownership of which errors reach its fatal screen; this change adds no new policy for continuing experiments or participant completion.

The integration fixture throws before configuration, exercises real session/deployment safeguards and page setup, and verifies a generated static build. A failure before the application JavaScript can execute remains outside this page’s reach.
