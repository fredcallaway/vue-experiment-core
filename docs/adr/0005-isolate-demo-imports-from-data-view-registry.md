# ADR 0005: Isolate demo imports from the data-view registry

- **Status:** Accepted and implemented
- **Date:** 2026-07-07
- **Scope:** `core/` template layer, `simplified` branch
- **Related:** [0004-playwright-testing.md](./0004-playwright-testing.md)
- **Relevant files:** `core/nuxt.config.ts`, `core/internal/demos/manifest.ts`, `core/pages/demo/index.vue`, `core/pages/demo/[slug].vue`, `core/composables/dataViews.ts`, `core/internal/demos/*.vue`

## Context

Data views are registered by calling `declareDataView(...)` at module scope. This is intentional for experiment epochs: when a project imports and uses an epoch component, the epoch's data view becomes available to the live `DataView` dev panel, session dashboards, and processed data export. That keeps transforms near the event shape they read and avoids a second manual registration step.

Demos are different. They are instructional examples under `core/internal/demos/`, not project epochs. Some demos declare example views such as `trial`, `simon`, and `survey`. Those views should exist while running the demo, but they should not appear in project dashboards or be written as empty files under `data/processed/...` for real experiment versions.

The current import graph makes demos too eager:

- `core/nuxt.config.ts` uses broad auto-import dirs (`internal/**`, `internal`), so exports from `core/internal/demos` are added to Nuxt's generated import registry.
- `core/internal/demos/manifest.ts` eagerly imports every demo component so `/demo` can list and render them.

Because demo components call `declareDataView(...)` at module scope, either path can evaluate demo modules outside the demo being actively run. Once evaluated, their views enter the single global `dataViews` registry and are indistinguishable from project views.

This is not a general problem with component-scoped data views. For example, `EClickTest` declaring a `clicktest` view is acceptable: if a project does not import or use `EClickTest`, the view is not registered. The problem is demos being pulled into the app for reasons unrelated to experiment usage.

## Decision

Minimize the blast radius by changing the demo import graph, not the data-view API.

1. **Remove demos from Nuxt auto-import.** Narrow `imports.dirs` so Nuxt still auto-imports public composables and explicitly intended internal modules, but does not scan `core/internal/demos`.

2. **Lazy-load demo components.** Change the demo manifest so it can expose titles and summaries without importing every demo SFC. A demo component should be imported only when that specific `/demo/<slug>` route renders it.

This preserves the existing `declareDataView(...)` model for real project and epoch code: views are automatically registered when the code that owns them is imported.

## Non-decision: scoped data-view registries

A scoped registry using Vue `provide`/`inject` is not a good fit for the current registration model. Demo data views are declared in a normal non-setup `<script>` block, which runs at module import time, before any component instance exists. `inject()` is only available during setup or APIs called from setup, so it cannot route those module-scope declarations into a demo-local registry.

Moving demo declarations into `<script setup>` would make injection possible, but it would also change registration timing from "module import" to "component mount." That is a larger API and teaching change, and it is unnecessary for the current problem.

## Consequences

- Opening data dashboards no longer registers demo-only views just because Nuxt generated imports for demo modules.
- Opening `/demo` no longer imports every demo component just to render the index.
- Opening `/demo/data` or `/demo/custom` may still register that specific demo's view for the lifetime of the SPA session. That is acceptable for this proposal: it only happens after the user explicitly runs a demo. Avoiding even that would require scoped demo views or explicit unregistering, which is a separate design.
- The existing "views follow used epochs" behavior remains intact for real experiment components.
- The demo manifest becomes slightly more structured because metadata and component loading are separated.

## Implementation sketch

### Narrow internal auto-imports

Replace broad internal scanning with explicit locations:

```ts
export default defineNuxtConfig({
  imports: {
    dirs: [
      'composables',
      'internal/composables',
      'internal',
    ],
  },
})
```

If `internal` is still too broad because it captures demo exports, list the intended files/modules explicitly instead of scanning the whole directory. The key invariant is that `internal/demos` is not auto-imported.

After this change, anything that relied on auto-imported demo exports should import them directly. That is desirable: demos are examples, not ambient framework APIs.

### Lazy-load demo components

Separate demo metadata from component import:

```ts
import { defineAsyncComponent, type Component } from 'vue'

export type DemoEntry = {
  title?: string
  summary: string
  component: () => Promise<{ default: Component }>
}

export const demos: Record<string, DemoEntry> = {
  data: {
    title: 'Data',
    summary: 'The pipeline: typed events -> data views -> export rows, grouped per trial.',
    component: () => import('./DataDemo.vue'),
  },
}

export const resolveDemoComponent = (entry: DemoEntry) =>
  defineAsyncComponent(entry.component)
```

`core/pages/demo/index.vue` reads only metadata. `core/pages/demo/[slug].vue` resolves the selected component and renders it.

The exact helper shape can vary, but the invariant is that importing the manifest does not import each demo SFC.

## Verification

- Inspect `.nuxt/imports.d.ts` after `bun run typecheck` or `bun nuxt prepare` and confirm it has no exports from `core/internal/demos/*`.
- Load `/data/versions/<version>` in a project with processed data and confirm demo views such as `trial` and `simon` are absent from the dashboard and are not written to `data/processed/...`.
- Load `/demo` and confirm the demo index renders without registering demo data views.
- Load a specific demo and confirm that demo still runs and its local preview data view still works.

## Open questions

- Should `/demo/<slug>` clean up any demo-registered data views on unmount, or is explicit demo navigation enough isolation?
- Should `declareDataView(...)` warn when a later registration overwrites an existing view with the same name? Demo `survey` and project `survey` can collide if both are imported in one SPA session.
- Should demo-only data views eventually use a separate helper to make their non-export status explicit in code examples?
