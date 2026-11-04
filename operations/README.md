# Agent operations

These local JSON commands expose tracked static Hosting deployment, study preparation, and review investigation. Run them from the experiment project's root. Projects without an `ops` package script can invoke `bun core/operations/cli.ts <resource> <action>` directly; adding the script is optional. `bun run ops -- --help` lists commands. Results go to stdout; diagnostics go to stderr. Prolific publication, participant actions, bonuses, and other money-spending operations have no CLI command.

## Deploy the site

```bash
bun run ops -- deploy inspect
bun run ops -- deploy run
```

Both commands require a clean committed checkout, including matching initialized submodules. `inspect` reports the local SHA, experiment version, explicit Firebase project/site, URL, and current tracking. `run` generates the static site, checks that Git has not changed, uploads only Hosting, verifies the live `ops-deployment.json` marker, and atomically updates `deployStatus` and `deploys/<timestamp>`. The existing study UI receives its eight-character `sha`, `version`, and `deployedAt`; the record also includes the full SHA, submodule revisions, and operation ID.

The dashboard's **Deploy Website** button uses this same tracked Hosting service and additionally requires the Firebase CLI's selected project to match `firebase.config.json`. Deployment passes `--envName deployment` to the project's Nuxt `generate` script, selecting `.nuxt/production` without changing the standard `.nuxt` directory used by installation, typechecking, and development. Database rules are a separate explicit deployment (`firebase deploy --only database --project <project-id>`).

### Fix a deployment mismatch

Use this procedure when **Create New Study** (`/prolific/create`) reports **Not deployed**, **Ready to deploy!**, **Warning: current code is not deployed**, or **Git worktree is not clean**. This is the agent workflow behind the researcher Docs' “agents know how to fix it.”

The page compares the local eight-character Git SHA with `deployStatus.sha` in Firebase and checks for uncommitted changes. Here, “current version” means the committed source revision; `epoch.config.ts`'s `version` separately identifies the participant procedure/data cohort. The hosted build marker is verified during deployment or reconciliation, rather than fetched on every page visit.

1. Inspect `git status --short` and `git submodule status --recursive` from the experiment root, and `git -C core status --short` for core edits. Finish and commit the intended changes in their owning repositories, then commit any adopted submodule pointer in the experiment repository. Preserve unrelated work; if it prevents a clean checkout, resolve that with the researcher before deploying.
2. Run `bun run ops -- deploy inspect`. Confirm the explicit project/site, local `sha`, configured `version`, and existing `tracked` deployment. If inspection reports a contact-email error, set the real researcher address as described [below](#configure-contact-and-version). If it reports a posted-version warning, review the published commit and follow the same section's version policy before continuing.
3. Run `bun run ops -- deploy run` to upload and track the intended commit. **Deploy Website** uses the same operation. If that button reports a Firebase CLI project mismatch, confirm the intended target in `firebase.config.json` and select it with `firebase use <project-id>` before retrying.
4. Verify that the result has `state: "tracked"`, its `fullSha` equals `git rev-parse HEAD`, and its project/site/version match the intended deployment. For an upload that succeeded but failed verification or tracking, use [reconciliation](#recover-an-interrupted-deployment) instead.
5. Reload **Create New Study** after a CLI deployment or reconciliation so it rereads `deployStatus`. Expect **Deployed and ready to publish** with the current commit. If an old saved deployment error remains after a verified success, use **Dismiss Error**. If a draft's version differs from the configuration or deployment, recreate the draft with the current version before publication.

The Git/deployment bypass checkboxes do not upload or verify a build. Resolve the mismatch with a tracked deployment before recruiting. Leave the final **Create & Publish Study** action to the researcher.

### Configure contact and version

Set `contactEmail` in `epoch.config.ts` to a real researcher email. Missing, malformed, and `fakeDomain.*` placeholder addresses block deployment before building/uploading, with no bypass. Production `build` and `generate` also enforce this check; local development and typechecking work with the starter placeholder.

`version` identifies the participant procedure/data cohort, while the Git SHA identifies each source revision. Keep the planned version while deploying and fixing bugs before posting a study. Additional recruitment batches from the same code can reuse that version. After posting, increment it for changes to the participant procedure or analysis, including conditions, stimuli, instructions, or recorded data interpretation.

`deploy inspect` returns structured `warnings` when the most recently posted study for this version (`studies/<id>/publishTime`) has a different or missing recorded SHA. Draft studies and earlier deployments alone do not trigger the warning. Once a build has deliberately been posted with the same version, additional unchanged-code batches compare against that latest publication. SHA comparison is conservative: documentation-only changes can warn too. Review the diff against the listed published commit; if keeping the version is intentional, acknowledge it explicitly:

```bash
bun run ops -- deploy run --allow-version-reuse
```

The warning remains on stderr when overridden. The dashboard offers a corresponding checkbox and rechecks before deployment/publication, including publication of an existing draft. Publication records the currently deployed SHA, so fixes between draft creation and posting are attributed to the build actually posted. A draft's version must match the current configuration and deployment before publication; recreate an outdated draft after changing version.

These checks use this project's stored dashboard publication history, not live Prolific queries. Studies posted outside the dashboard, missing publication records, and non-Prolific recruitment require a manual history check. A successful deployment does not freeze a version, publish a study, or authorize recruitment.

The project comes from `firebase.config.json`, not the Firebase CLI's active alias. Configure one static site in `firebase.json`, using `hosting.public: ".output/public"` and optional `hosting.site`; the default site is the project ID. Target aliases, multiple sites, framework backends, and function/Cloud Run rewrites are rejected. Deployment uses a temporary Hosting-only Firebase config without deploy hooks. The project's `generate` script and `epoch.config.ts` must run with Bun; version loading supplies the `defineEpochConfig` identity helper.

### Recover an interrupted deployment

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
