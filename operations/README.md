# Agent operations

These local JSON commands expose tracked static Hosting deployment, study preparation, and review investigation. Run them from the experiment project's root. Projects without an `ops` package script can invoke `bun core/operations/cli.ts <resource> <action>` directly; adding the script is optional. `bun run ops -- --help` lists commands. Results go to stdout; diagnostics go to stderr. Prolific publication, participant actions, bonuses, and other money-spending operations have no CLI command.

## Deploy the site

```bash
bun run ops -- deploy inspect
bun run ops -- deploy run
```

Both commands require a clean committed checkout, including matching initialized submodules. `inspect` reports the local SHA, experiment version, explicit Firebase project/site, URL, and current tracking. `run` generates the static site, checks that Git has not changed, uploads only Hosting, verifies the live `ops-deployment.json` marker, and atomically updates `deployStatus` and `deploys/<timestamp>`. The existing study UI receives its eight-character `sha`, `version`, and `deployedAt`; the record also includes the full SHA, submodule revisions, and operation ID.

The project comes from `firebase.config.json`, not the Firebase CLI's active alias. Configure one static site in `firebase.json`, using `hosting.public: ".output/public"` and optional `hosting.site`; the default site is the project ID. Target aliases, multiple sites, framework backends, and function/Cloud Run rewrites are rejected. Deployment uses a temporary Hosting-only Firebase config without deploy hooks. The project's `generate` script and `epoch.config.ts` must run with Bun; version loading supplies the `defineEpochConfig` identity helper.

Deployment records live in Git's `agent-operations/deployments/` directory. If upload succeeds but verification or tracking fails, inspect the reported record and retry tracking with:

```bash
bun run ops -- deploy reconcile --id <operation-id>
```

Reconciliation verifies that this operation's marker is still live before writing tracking; it never uploads. After a build/upload failure, fix the reported problem and use `deploy run` again. For an interrupted process, confirm its PID is no longer running before removing the exact lock path reported by the CLI. The lock coordinates CLI mutations in this checkout, not browser actions or other machines.

## Prolific drafts and investigation

```bash
bun run ops -- study-draft get
bun run ops -- study-draft update --json '{"reward":250,"total_available_places":20}'

bun run ops -- review inspect --study 0123456789abcdef01234567
bun run ops -- review inspect --study 0123456789abcdef01234567 --submission 89abcdef0123456789abcdef

bun run ops -- review-draft get --study 0123456789abcdef01234567
bun run ops -- review-draft update --study 0123456789abcdef01234567 \
  --json '{"actionOverrides":{"89abcdef0123456789abcdef":"return"}}'
```

Use `--file path/to/input.json` instead of `--json` for larger updates. Review actions are `approve`, `return`, `reject`, or `none`; a `null` value deletes an override. Bonus values are integer cents from 0 through 2,000; `null` deletes a bonus override.

`review inspect` reads the project token from `.prolific_token` and performs only Prolific GET requests. Pass `--fixture core/operations/fixtures/review-study.json` to use the bundled Prolific mock fixture instead.

The CLI intentionally has no command to create or publish a Prolific study, approve/return/reject submissions, or pay bonuses. Agents prepare RTDB-backed drafts; the researcher reviews them and uses the existing web-interface button for the final Prolific action.

Run `bun run test` for unit tests and `bun run typecheck` after edits. Tests use an in-memory Prolific reader and never contact Prolific.
