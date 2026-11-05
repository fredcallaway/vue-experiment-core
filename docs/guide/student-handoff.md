# Prepare a student handoff

Use this procedure when the lab manager asks you to prepare a new student's experiment setup. The result is one block of text the manager can copy and send privately. The student pastes it into the installer or gives it to their coding agent, following the [template README](../../../README.md#create-your-experiment).

Run the preparation script from a current template checkout. The source project can be elsewhere on disk. It must already have a Firebase project dedicated to the student's experiment, a web app, Realtime Database, a Hosting site, and a deployment service account. For independent use, [set up Firebase first](firebase-setup.md).

## Gather the information

Confirm these with the manager or read them from the configured project:

- **Project name** — the new local folder name, using letters, digits, and hyphens.
- **Researcher contact email** — the real address to show participants; use the intended value from `epoch.config.ts`.
- **Firebase web configuration** — the complete `firebase.config.json`, including the database URL.
- **Hosting site** — resolved from `firebase.json` and `.firebaserc`; the default site is the Firebase project ID.
- **Deployment key** — the project's service-account JSON key. Use the already configured key in Git metadata, or obtain the key's file path from the manager.
- **Template source** — a committed template revision and its clone URL. The generator records the current template HEAD and defaults to the public template repository.

The service account needs the project-scoped Hosting Admin and API Keys Viewer roles. Confirm the database exists and its rules support the intended experiment. Hosting credentials do not authorize the current database adapters; keep database-rule changes separate. Never reuse the template's Firebase project or an unrelated research project's credentials.

Before sending a block, confirm that its template commit and pinned core commit are available from the stated repositories to the student. Commit local changes and publish the release through the normal release process first. A local-only commit cannot be installed from the public URL. For an internal test, `--repository` can name an absolute local clone path.

## Produce the block

Choose an output path outside Git repositories, in an existing private directory. From the template checkout, run:

```bash
node scripts/prepare-student.mjs \
  --project /absolute/path/to/configured-project \
  --name my-experiment \
  --contact-email researcher@lab.edu \
  --out /absolute/private/path/my-experiment-setup.txt
```

The script reads the project's configured deployment key automatically. If it has not been configured locally, add `--key /absolute/path/to/service-account.json`. Use `--template /path/to/template-checkout` and `--repository <clone-url>` to choose a different template source. Run `--help` for the full command.

The output includes the complete private key, has owner-only file permissions, and refuses to overwrite an existing file. It is a single JSON block between `-----BEGIN EXPERIMENT SETUP-----` and `-----END EXPERIMENT SETUP-----`. The generator checks that the key and web configuration identify the same project. It does not create cloud resources, deploy, or change the source project.

Give the manager the complete block as one copyable text block, including its boundary lines. Keep any explanation outside that block. Send it only to the manager here; the manager will forward it privately to the student. Treat the block like the deployment key: keep it out of source files, issue trackers, public documentation, and logs. An agent can pass it to the installer through stdin or an owner-only file outside the project:

```bash
node scripts/create-experiment.mjs --file /absolute/private/path/my-experiment-setup.txt
```

The installer clones the recorded revision and its pinned core, starts independent Git history, writes the public project configuration and researcher contact, and uses the existing [persistent credential setup](../../operations/README.md#configure-firebase-authentication-once). It installs dependencies and runs typechecking. The private key stays in Git metadata, outside the tracked source and deployed assets. Setup does not deploy or recruit participants.

If setup stops after creating the project, preserve that folder and finish the reported installation step there. Use `--directory <new-folder>` when the student wants a different destination. Existing folders are never overwritten.

Prolific is connected later through the app's existing setup form. Its account token is not part of this Firebase/project handoff. The [researcher guide](../../internal/docs/DocsResearcher.vue) covers development, data checks, posting, and payments.
