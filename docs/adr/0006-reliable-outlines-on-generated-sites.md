# ADR 0006: Provide reliable epoch outlines on generated sites

- **Status:** Proposed (decision pending)
- **Date:** 2026-08-13
- **Scope:** `core/` template layer, generated/static deployments on the `simplified` branch
- **Related:** [0003-offscreen-outline-traversal.md](./0003-offscreen-outline-traversal.md),
  [0004-playwright-testing.md](./0004-playwright-testing.md)
- **Relevant files:** `core/internal/composables/useEpochTree.ts`,
  `core/internal/components/EpochOutline.vue`,
  `core/internal/components/OutlineWorkerFrame.vue`,
  `core/internal/components/OutlineWorkerDriver.vue`, `core/layouts/default.vue`,
  `package.json`, `firebase.json`

## Context

The Epochs panel cannot derive the complete experiment tree from the currently mounted Vue tree.
Only the active path exists at runtime. To discover future epochs, `traverseTimeline` actually
advances a live experiment from its current position to `__TOP_EPOCH__`, records the epochs that
mount, and then restores the starting position.

ADR 0003 moved this destructive traversal out of the developer's visible tab. The current design
mounts a hidden, same-origin iframe at the same route with `?outlineWorker=1&noDev=1`. The iframe:

1. boots a second copy of the entire application;
2. traverses the experiment in debug mode with the data writer disabled;
3. serializes the discovered tree to route-keyed `localStorage`; and
4. announces the update through a `BroadcastChannel`.

The visible page initially constructs an outline from the live path. It replaces that partial tree
with the cached full tree when it receives the worker's announcement. This architecture is useful
during development because the worker can re-traverse after HMR without reloading or mutating the
developer's tab.

The same worker currently runs in generated deployments. That creates a different user experience:
the deployed `/dev` page first downloads and initializes the visible application, then downloads,
parses, and initializes another application instance in the iframe before a full outline is
available. Browser caching can reduce the second download, but it does not eliminate the second
application boot or its asynchronous coordination.

## Reproduction and evidence

The reported site was `https://bandits-4b10e.web.app/dev`, experiment version
`4arm-v5-eckstein`, generated from `/Users/fred/projects/prakhar-ac/bandit-task` on 2026-08-12.

### What was ruled out

- **The deployed site was not running old outline code.** Its main generated bundle
  (`_nuxt/-cTtK0k3.js`) and the local `.output/public` bundle had the same SHA-256 digest:
  `e9fe2ba9ee6572d471dec8ba5870ef25e0dfb07ec7e08ba16639090dfbb32a35`.
- **The experiment project and this template had the same outline implementation.** Their
  `useEpochTree.ts` files had the same SHA-256 digest:
  `77baf8a22e9d3910a0101ebb66d9afebaaf19a3a0519ebc44ce0b9f2733bf2d3`.
- **Traversal itself worked in production.** Successful worker runs traversed the bandit timeline
  in roughly 5-9 ms, wrote a 2,136-byte `epoch-outline:/dev` cache, and rendered 12 visible rows.
- **A generated SPA can populate an outline.** A fresh `nuxt generate` of the template, served by
  a plain static SPA server rather than the Nuxt dev server, populated `/dev` and `/docs` after
  storage was cleared.

### What was reproduced

Across ten new browser sessions opened against the Bandits deployment, eight had the complete
12-row outline at the first inspection and two initially had only the live path
(`experiment -> consent`, two rows) with no outline cache. The two incomplete sessions later
received the full outline after the iframe finished loading and traversing.

This confirms an **intermittent production startup delay**. It does not by itself prove that a
`BroadcastChannel` update is permanently lost. A permanently partial outline remains possible in
the current protocol because channel messages are ephemeral and there is no readiness,
acknowledgement, retry, or durable-notification protocol, but that failure was not directly
observed in this investigation.

### Why local development hides the problem

The local server makes the second application boot unusually cheap: assets are local, frequently
warm, and HMR keeps module state available. A deployed cold load adds network latency and browser
work before the iframe can publish its result. The worker traversal is fast; loading the worker is
the dominant delay.

Firebase also served the generated HTML with `Cache-Control: max-age=3600`. This is relevant to
deploy freshness, but it was not the cause in this reproduction because the deployed and local
bundles were identical.

## Requirements

A solution should provide these properties:

1. A generated `/dev` page shows the complete outline promptly and reliably on its first visit.
2. The visible experiment instance is never traversed or reloaded to build the outline.
3. Development retains automatic HMR-driven outline updates.
4. An experiment project does not have to maintain a second, hand-written description of its
   timeline.
5. The outline remains route-specific and compatible with pages such as `/docs` and
   `/examples/<slug>`.
6. Traversal failures are visible during generation or in the Epochs panel rather than silently
   producing a plausible partial tree.
7. Projects that cannot precompile an outline still have a usable fallback.

The existing assumption from ADR 0003 still applies: the outline is deterministic for a given
experiment build and route. Conditional or randomized structures are discussed separately below.

## Options considered

### A. Keep runtime traversal and make synchronization durable

Retain the hidden iframe in generated sites but remove the timing gap in how its result reaches the
parent. The robust version is more than a single extra handshake message:

- install parent listeners before the first cache read;
- read the durable `localStorage` cache after listeners are installed;
- listen for the browser's same-origin `storage` event as well as `BroadcastChannel`;
- have the worker announce readiness and the parent request traversal only after readiness;
- acknowledge completion and retry or time out when no completion arrives; and
- show an explicit loading/error state while the full outline is unavailable.

The cache, rather than a channel message, remains the source of truth. A notification only tells
the consumer to read it. Correct ordering plus a final cache read is important because adding a
`worker-ready` message alone just creates another ephemeral message that can be missed.

**Advantages**

- Smallest change to the current architecture.
- Preserves one mechanism for development and deployment.
- Always computes from the exact code running in the browser.
- Requires no build-time browser dependency or route manifest.

**Disadvantages**

- Does not solve the reproduced delay: production still boots a second application before the
  outline is complete.
- Doubles application initialization work on every cold `/dev` visit.
- Retains iframe lifecycle and cross-context coordination complexity.
- A traversal failure occurs in the viewer's browser and must be diagnosed there.

**Justification for considering this option:** it is the narrowest repair if the goal is only to
make the existing runtime worker eventually reliable. That was the basis of the initial handshake
recommendation. It is not, by itself, evidence that runtime traversal is the best deployed-site
design.

### B. Precompile outlines during generation and use them in production — **recommended direction**

Keep the iframe worker for development, where HMR makes dynamic traversal valuable. For generated
builds, run the same traversal once during the generation/deployment workflow and write its
serialized result to a conventional static path, for example:

```text
.output/public/_epoch/outlines/dev.json
.output/public/_epoch/outlines/docs.json
.output/public/_epoch/outlines/examples/study.json
```

The production bundle always knows how to request that path, so producing the JSON after the Nuxt
client build does not require rebuilding the bundle. On a generated site, `useEpochTree` loads the
static outline before falling back to the live path or runtime worker. In development it continues
to use the iframe worker and HMR.

A practical generation sequence is:

1. run `nuxt generate` to produce the SPA;
2. serve `.output/public` through an ephemeral local static server with SPA fallback;
3. launch a headless browser against each configured outline route in worker/debug mode;
4. invoke or await the existing `traverseTimeline` implementation;
5. validate and extract the serialized outline; and
6. write the JSON files into `.output/public`, failing generation if a required route cannot be
   traversed.

The browser process should reuse the application's real traversal implementation instead of
reimplementing epoch semantics in a Node build script. This work overlaps with the self-driving
browser infrastructure proposed in ADR 0004.

**Advantages**

- The deployed page can render the full outline immediately from a small static asset.
- No hidden second application or runtime traversal is needed in production.
- Traversal cost is paid once per build rather than once per viewer.
- A failed or hanging traversal can fail deployment, turning an intermittent viewer-side problem
  into a reproducible build error.
- The artifact is inspectable, cacheable, and tied to the generated application version.
- Development keeps the current responsive HMR workflow.

**Disadvantages and required design work**

- Generation now needs a browser runtime such as Playwright/Chromium. Installation and CI caching
  must be documented and made reliable.
- The build needs an explicit route source. Nuxt's client router can discover application routes,
  but not every dynamic route value (for example every `/examples/<slug>`). A small manifest or
  existing examples manifest should define which outlines are required.
- The static server must reproduce hosting's SPA fallback behavior.
- Browser startup makes `bun run generate` slower.
- Conditional or randomized timelines need a policy. The current runtime worker already follows
  only the structure mounted for its debug session, so precompilation does not introduce this
  limitation, but it makes the chosen build artifact authoritative. Options include enforcing a
  deterministic debug seed, generating one outline per configured condition, or explicitly
  rejecting condition-dependent structure.
- The static asset and generated JavaScript must be deployed atomically. Content-addressing or a
  build/version field in the JSON should prevent an hour-cached HTML document from accepting an
  outline produced by a different application build.

**Why this is preferable for deployed sites:** it addresses both observed facts—the second-app
startup delay and the fragile runtime coordination—rather than only strengthening the message
protocol. Its additional complexity is concentrated in the build pipeline, where failures are
repeatable and affect developers, instead of in every viewer's browser.

### C. Hybrid precompile with runtime fallback

Implement B as the preferred production path but retain A as a fallback when the static outline is
missing, incompatible, or rejected as stale.

The runtime sequence would be:

1. load the version-matched static outline;
2. if it succeeds, render it and do not mount a production worker;
3. if it fails, show the live-path outline and start the runtime worker; and
4. surface a warning that the deployment lacks a usable precompiled outline.

**Advantages**

- Existing projects continue working while adopting the new generation step.
- Manual or nonstandard deployments degrade to current behavior rather than losing the outline.
- A bad static artifact is recoverable from the browser.

**Disadvantages**

- Both mechanisms remain in the codebase.
- Without a visible warning, fallback can hide a broken build pipeline indefinitely.

This is the safest migration path if B is adopted. The fallback should be treated as degraded mode,
not as an equally preferred production path.

### D. Publish outlines to Firebase/RTDB

Traverse during development or deployment and store the result under a build/version and route key
in RTDB. Generated pages fetch it at runtime.

**Advantages**

- An outline can be updated independently of Hosting assets.
- Existing Firebase infrastructure is available in most experiment projects.

**Disadvantages**

- Couples a developer tool to configured Firebase credentials and database rules.
- Adds a network dependency and another cache-invalidation problem.
- Can serve an outline from the wrong deployed code unless version matching is strict.
- Does not work naturally for projects without Firebase.

This is inferior to a static build artifact when the outline belongs to one immutable deployment.

### E. Declare the timeline statically

Require epoch components or experiment authors to expose a static tree instead of discovering it by
running the experiment.

**Advantages**

- Eliminates traversal, iframe workers, and build-time browsers.
- Makes all possible conditional branches representable in principle.

**Disadvantages**

- Creates a second representation that can diverge from the executable experiment.
- Requires a substantial epoch API redesign or author-maintained metadata.
- Dynamic composition, conditions, and component-owned subtrees make accurate inference difficult.

This remains the cleanest theoretical model but is disproportionate to the current problem.

### F. Accept partial-first rendering

Keep the current implementation and document that generated sites show only the live path until the
worker finishes.

This is not recommended. The panel provides no clear loading state, so a correct-but-incomplete
tree looks like the final outline. The behavior is easy to mistake for a broken experiment and was
the source of this investigation.

## Recommendation

Adopt **B with C as the migration strategy**:

- use the existing iframe worker during development;
- precompile versioned, route-specific outline JSON during `bun run generate`;
- prefer that artifact in generated builds and avoid mounting the production worker when it is
  valid; and
- retain a visible runtime fallback for projects whose generation workflow has not yet produced an
  artifact.

Before implementing the full pipeline, A can be tightened independently because durable cache
synchronization improves the development worker too. It should not be presented as the deployed
architecture's final solution.

## Consequences if adopted

- `bun run generate` becomes an integration workflow rather than only a Nuxt compilation command.
- The template gains a browser dependency and a small outline-route manifest/API.
- Generated output contains explicit outline artifacts associated with the application build.
- Production `/dev`, `/docs`, and configured example pages no longer need to boot the hidden worker
  in the common case.
- The Epochs panel needs distinct loading, precompiled, fallback, stale, and failed states.
- `core/CHANGES.md` must document the new generation requirement when implementation changes
  external behavior. This proposed ADR alone does not change behavior and therefore does not add a
  migration entry.

## Verification plan

An implementation should be accepted only after these checks:

1. Generate the Bandits project from a clean checkout and confirm the expected outline JSON exists.
2. Serve `.output/public` with the same SPA fallback used by Firebase Hosting.
3. Open `/dev` in at least 20 isolated cold browser contexts and assert that all 12 expected rows
   are present without an outline-worker iframe.
4. Repeat for `/docs` and every configured example route.
5. Corrupt or remove the artifact and confirm the page clearly enters fallback mode and eventually
   obtains a full outline.
6. Change the experiment version/structure without regenerating the artifact and confirm version or
   structural validation rejects it.
7. Introduce an epoch traversal error and confirm generation fails with the failing route and epoch
   id.
8. Run `bun run typecheck` and the normal production build.

## Open questions

- What is the canonical list of routes whose outlines are precompiled: Nuxt static routes plus
  explicit dynamic-route entries, or a dedicated outline manifest?
- Should missing outlines fail every build, only deployment, or only routes marked required?
- What build identifier should bind an outline to its JavaScript: experiment version, git SHA,
  Nuxt build id, or a content digest?
- Should conditional experiments emit one artifact per condition, a merged tree, or reject
  condition-dependent structure until the outline format represents alternatives?
- Can the browser harness from ADR 0004 serve both reachability testing and outline generation so
  the template pays the Playwright complexity only once?
- Should the precompiled JSON live under a public URL, be imported into the client bundle, or be
  embedded in a generated manifest? A public versioned asset avoids a second client build and is
  the simplest initial implementation.
