# Driving the Experiment in a Browser

How to exercise a running experiment from a browser-automation agent (Playwright MCP or similar). Everything here works against the `/dev` page as it already ships — there is no separate agent API to install.

Only do this when the task calls for it. Most changes are verified with `bun run typecheck` and by reading the examples; drive the browser when you need to confirm that something actually *runs* — a trial renders, an event fires with the right payload, a phase advances.

## The core loop

1. Jump straight to the epoch you care about with a `?jump=` URL.
2. Interact with the page.
3. Read the event log to confirm the experiment recorded what you expected.

You do not need to click through the experiment from the beginning, and you should not. Jumping is a URL, so it is a single navigation.

## Jump to any epoch by URL

`/dev` accepts a `jump` parameter naming an epoch id:

```
http://localhost:<port>/dev?jump=experiment[4]-main[0]-trial[0]-choice
```

The page loads, runs the timeline forward to that epoch with data writing disabled, and stops there. The same parameter works on other routes that render a timeline, such as `/examples/<slug>`.

An epoch id is the path from the root, with `[index]` on each indexable ancestor: `experiment[4]-main[0]-trial[0]-choice` is the `choice` epoch, in iteration 0 of `trial`, in iteration 0 of `main`, which is step 4 of `experiment`. `ERepeat` and `ESequence` steps index numerically; phase epochs index by phase name, as in `experiment[5]-clicktest[play]-play`.

Do not guess ids — read them from the page (next section). If a jump fails, the event log shows exactly why, for example `jumpToEpoch: epoch 'main' not found (bracket)`, and `jumpToEpoch` falls back to the longest prefix it can reach rather than erroring out. A jump that silently lands somewhere unexpected usually means the id was wrong.

## Read the epoch ids off the page

Every row in the outline panel carries its id in a `data-epoch-id` attribute. One evaluate call gives you the whole timeline:

```js
[...document.querySelectorAll('[data-epoch-id]')].map(e => e.getAttribute('data-epoch-id'))
```

```
experiment
experiment[0]-EContinue
experiment[4]-main
experiment[4]-main[0]-trial
experiment[4]-main[0]-trial[0]-choice
experiment[5]-clicktest[play]-play
...
```

The outline is also cached in `localStorage` under `epoch-outline:<route>` (for example `epoch-outline:/dev`) as serialized JSON, including each node's `nSteps`. Use that when you want the tree structure rather than a flat list.

The outline covers the epochs discovered by timeline traversal, which runs in a hidden iframe worker (see ADR 0003). An `ERepeat` whose iterations differ structurally only shows a given iteration's shape once that iteration has run, so an id you expect may not appear until you jump into that branch.

## Verify with the event log

The Events panel is the primary check that the experiment did what you think. It shows the live event stream — declared semantic events plus automatic `participant.*` events — most recent first, with timestamps and payloads.

After a jump, the log is separated by a `────── jump ──────` divider: events above it are from your interaction, events below are the replayed setup. Read only above the divider.

Scrape it as text, then assert on what matters:

```js
document.body.innerText.slice(document.body.innerText.indexOf('Events'))
```

```
participant.click   0:09.237   click   {"value": "orange"}
bonus.update        0:09.239   {"change": 1, "total": 1}
epoch.start         0:10.248   experiment[4]-main[1]-trial[0]-choice
```

That excerpt confirms three things at once: input registered, the semantic event fired with the right payload, and the timeline advanced to the next trial. Remember that `participant.*` events are debugging aids — when checking the *data record*, assert on the declared events the task logs itself.

The filter box supports `space` for AND, `,` for OR, `!` to negate, and `*` as a wildcard (e.g. `!epoch *.trial`), and the epoch/participant/hover checkboxes toggle whole categories. Filtering in the UI is usually easier than filtering the scraped string.

The Data panel beside it renders declared data views against the running session, which is the fastest way to check that a `declareDataView(...)` transform produces the columns you expect.

## Useful URL flags

| Flag | Effect |
| --- | --- |
| `jump=<epochId>` | Run to that epoch on load. |
| `noDev=1` | Hide the dev chrome and render the bare participant view. Jumping still works. |
| `fast=1` | Fast mode: collapse delays so long trials do not cost real time. Persists in `sessionStorage`, so it stays on for the rest of the tab once set. |
| `condition.<key>=<value>` | Pin a condition instead of taking the next cyclic assignment. |

**Flags need an explicit value.** `getUrlFlag` accepts only `1`, `true`, or `yes`. A bare `?noDev` or `?fast` parses as empty and is silently false, so you get dev chrome when you expected the clean view. Always write `?noDev=1`.

Combine them to test the real participant experience at an arbitrary point:

```
http://localhost:<port>/dev?jump=experiment[5]-clicktest[play]-play&noDev=1&fast=1
```

## Notes and gotchas

- **Find the dev server, do not start one.** The port is set by the `dev` script in `package.json`. If nothing is serving, ask rather than launching your own.
- **`/dev` never writes live data.** It refuses to initialize a session in `mode=live`, and jump traversal runs with the data writer disabled, so jumping around is safe.
- **The window-size enforcer applies.** Below the minimum viewport (800×600 by default, and projects may change it via `defineWindowSize`) the experiment replaces itself with a "window isn't large enough" message. Resize the browser before concluding a page is broken.
- **The outline worker iframe is expected.** A hidden same-origin iframe with `?outlineWorker=1&noDev=1` appears in snapshots and duplicates the nav landmarks. Ignore it.
- **PostHog 404s are benign** when no key is configured (`us-assets.i.posthog.com/array/NULL/...`). Do not chase them.
- **Experiment content runs inside an error boundary**, so a thrown epoch shows a fallback and logs the error instead of blanking the page. Check the event log and console when a page looks wrong but not empty.
