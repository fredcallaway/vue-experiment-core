# Prepare a student handoff

Use this procedure when the lab manager asks for a student's experiment setup or says **“Make me a setup block.”** The request authorizes creating a fresh Firebase project, provisioning its resources and deployment key, and returning one complete private block. Before provisioning resources or generating the block, require a project name and participant-facing researcher contact email from the manager. If either is missing, ask for all missing values together and pause until the manager supplies them. Explicit instructions to review documentation, dry-run, or avoid resource creation take precedence.

The manager forwards the block privately. The student pastes it into the installer or gives it to their coding agent, following the [template README](../../../README.md#create-your-experiment). Creating the student's local experiment checkout is the installer's later job; preparing the block does not require running that installer on the manager's machine.

If the experiment requires audio or other file uploads, include the optional [Storage setup](audio-and-files.md#enable-firebase-storage-for-a-project). The default handoff provisions Hosting and Realtime Database; the receiving project also needs the Storage rules entry described there before live collection. Creating a setup block alone does not authorize upgrading billing.

## Confirm project details and source

Use the manager's supplied project name and researcher contact email. Resolve the remaining settings as follows:

- **Project and folder name:** ask the manager if it was not provided. Use the supplied name for the Firebase project ID, Hosting site, and student's default local folder. If it cannot be used as an available Firebase project ID, ask for a suitable replacement.
- **Researcher contact email:** use the participant-facing address provided by the manager, and ask for it if missing.
- **Administrator account:** reuse the manager's existing Firebase CLI login. Use `firebase login:list` for account discovery; its `--json` output includes authentication tokens and must not be printed. Request interactive login only if authentication is actually missing or expired.
- **Database region:** use the project's documented region, otherwise `us-central1`.
- **Resources:** create a new project unless the manager explicitly selects an existing one. Do not choose the template's project, an earlier test project, or another experiment merely because credentials are available.

Once both required values are supplied, state the project name and contact in a progress update and continue. Missing optional student details are not a blocker. Stop for a concrete authentication, permission, quota, or policy failure that cannot be resolved within the request; report what was completed and the exact remaining action.

Run the preparation script from a clean, committed template checkout. Check that its HEAD and pinned core commit are available from their stated repositories. Follow the repository's release process for any required publication; do not silently substitute an older revision. A local-only commit cannot be installed from the public URL. If publication remains blocked, finish the private preparation and identify the unpublished revisions before presenting the block as ready to send. For an explicitly local installer test, `--repository` can name an absolute local clone path.

## Provision the Firebase project

If the manager explicitly selected an existing project, inspect its resources and configured deployment key first. Reuse the completed setup and provision only missing requirements. A fully configured project can proceed directly to verification and block generation.

Create a private provisioning directory outside Git repositories, with mode `0700`. Keep the key and generated block there with mode `0600`. Copy the template's `firebase.json` and `database.rules.json` into it, and run all provisioning commands there. Leave the template checkout's Firebase configuration unchanged.

Use the selected name as `EXPERIMENT_FIREBASE_PROJECT_ID`. Install the Firebase CLI if necessary, then:

```bash
firebase projects:create "$EXPERIMENT_FIREBASE_PROJECT_ID" --display-name "$EXPERIMENT_FIREBASE_PROJECT_ID"
firebase init database --project "$EXPERIMENT_FIREBASE_PROJECT_ID"
firebase apps:create WEB experiment --project "$EXPERIMENT_FIREBASE_PROJECT_ID"
```

Run `firebase init database` in a PTY and answer its prompts yourself: use `database.rules.json`, create the first database in the selected region, and keep the copied rules when asked about overwriting them. See [first-database initialization](../hiccups/initialize-project.md). The standalone `database:instances:create` command requires an existing default database, so it cannot create the first one.

For this new empty project, deploy the copied template rules with `firebase deploy --only database --project "$EXPERIMENT_FIREBASE_PROJECT_ID"`. The template's current rules permit unauthenticated reads and writes until their configured expiry; state this access model in the handoff summary. Hosting credentials do not authorize the current database adapters. Changing the database access design is separate work.

Record the new web App ID and download its complete SDK configuration to a previously nonexistent file:

```bash
firebase apps:sdkconfig WEB "$EXPERIMENT_FIREBASE_APP_ID" --project "$EXPERIMENT_FIREBASE_PROJECT_ID" --out firebase.config.json
firebase database:instances:list --project "$EXPERIMENT_FIREBASE_PROJECT_ID"
firebase hosting:sites:list --project "$EXPERIMENT_FIREBASE_PROJECT_ID"
```

Confirm `firebase.config.json` contains the new project's `projectId`, `appId`, and exact `databaseURL`; add the database URL from the instance metadata if it is absent. Use the default Hosting site named after the project ID. If it is absent, create it with `firebase hosting:sites:create "$EXPERIMENT_FIREBASE_PROJECT_ID" --project "$EXPERIMENT_FIREBASE_PROJECT_ID"`. Set `hosting.site` in the provisioning copy of `firebase.json` to that site, retaining `.output/public` and the single-page-app rewrite. Write `.firebaserc` with `projects.default` set to the new project ID.

Create a dedicated `experiment-deployer` service account with the project-scoped roles `roles/firebasehosting.admin` and `roles/serviceusage.apiKeysViewer`, then create its JSON key. If an authenticated Google Cloud CLI is available, use the commands in [Create deployment credentials](firebase-setup.md#create-deployment-credentials), keeping its existing login. A missing `gcloud` installation does not require another manager interaction: the existing Firebase CLI administrator session can authenticate the Google REST APIs as described below.

### Use the Firebase administrator session for IAM

For an agent using the installed Firebase CLI, resolve its executable and inspect that installation's `lib/auth.js`. The following Node pattern uses the existing login without displaying tokens or creating another account. It relies on Firebase CLI internals, so verify these exports against the installed version first. Keep any task script in the private provisioning workspace.

```bash
export EXPERIMENT_FIREBASE_CLI="$(command -v firebase)"
```

```js
import { realpath, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

const require = createRequire(await realpath(process.env.EXPERIMENT_FIREBASE_CLI))
const auth = require('../auth.js')
const account = auth.getGlobalDefaultAccount()
if (!account) throw new Error('Firebase administrator login required')
const token = await auth.getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform'])

async function api(url, body) {
  const response = await fetch(url, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const result = await response.json()
  if (!response.ok) throw new Error(`Google API request failed: HTTP ${response.status}: ${result.error?.message}`)
  return result
}
```

Use that in-memory `api` helper for these operations, replacing `PROJECT_ID` and `SERVICE_ACCOUNT_EMAIL` with the new project's values:

1. Enable IAM with `POST https://serviceusage.googleapis.com/v1/projects/PROJECT_ID/services/iam.googleapis.com:enable`, body `{}`. Poll the returned operation until complete using `GET https://serviceusage.googleapis.com/v1/OPERATION_NAME`.
2. [Create the service account](https://docs.cloud.google.com/iam/docs/reference/rest/v1/projects.serviceAccounts/create) with `POST https://iam.googleapis.com/v1/projects/PROJECT_ID/serviceAccounts`, body `{ "accountId": "experiment-deployer", "serviceAccount": { "displayName": "Experiment deployer" } }`. Record its returned email.
3. Fetch the project's policy with `POST https://cloudresourcemanager.googleapis.com/v1/projects/PROJECT_ID:getIamPolicy`, body `{ "options": { "requestedPolicyVersion": 3 } }`. Preserve the full policy, including its `etag`, bindings, and conditions; add `serviceAccount:SERVICE_ACCOUNT_EMAIL` to unconditional bindings for the two roles above. [Write the updated policy](https://docs.cloud.google.com/resource-manager/reference/rest/v1/projects/setIamPolicy) with `POST https://cloudresourcemanager.googleapis.com/v1/projects/PROJECT_ID:setIamPolicy`, body `{ "policy": UPDATED_POLICY }`. On a policy conflict, fetch and merge again.
4. [Create the key](https://docs.cloud.google.com/iam/docs/reference/rest/v1/projects.serviceAccounts.keys/create) with `POST https://iam.googleapis.com/v1/projects/PROJECT_ID/serviceAccounts/SERVICE_ACCOUNT_EMAIL/keys`, body `{ "privateKeyType": "TYPE_GOOGLE_CREDENTIALS_FILE" }`. Decode the response's `privateKeyData` directly into the private workspace, for example `await writeFile(keyPath, Buffer.from(result.privateKeyData, 'base64'), { mode: 0o600, flag: 'wx' })`. Do not print the response or the decoded key.

Wait for API enablement and IAM propagation before testing. On an uncertain creation response, inspect the selected project's resources before retrying so the workflow does not create duplicate projects, accounts, or keys. Keep administrator tokens out of the handoff; it contains only the new project's service-account key.

## Verify the provisioned project

Before producing the block:

- Check the web config, database URL, Hosting site, service-account email, and key `project_id` all identify the new project.
- Read back the service account's two project-level role bindings and the deployed database rules.
- Run `firebase hosting:sites:list --project PROJECT_ID` in a child process with a fresh private `HOME`/`XDG_CONFIG_HOME`, `GOOGLE_APPLICATION_CREDENTIALS` set to the new key, and inherited `FIREBASE_TOKEN` cleared. This must succeed without the manager's cached login. Do not change the parent shell or global Firebase login.
- Confirm no credentials were written inside a source checkout. Keep resource IDs and non-secret verification evidence in the work record; keep the key and block in their private directory.

This verifies provisioning and service-account access. It does not deploy the experiment, test a participant session, or post a Prolific study.

## Produce the block

From the clean template checkout, pass the provisioning directory and its new key:

```bash
node scripts/prepare-student.mjs \
  --project /absolute/private/path/provisioning \
  --name my-experiment \
  --contact-email researcher@lab.edu \
  --key /absolute/private/path/service-account.json \
  --out /absolute/private/path/my-experiment-setup.txt
```

Replace the example name and email with the values supplied by the manager. If the manager explicitly selected an already configured experiment checkout, use that as `--project`; the script reads its deployment key from Git metadata when `--key` is omitted. Use `--template /path/to/template-checkout` and `--repository <clone-url>` to choose a different template source. Run `--help` for the full command.

The output includes the complete private key, has owner-only file permissions, and refuses to overwrite an existing file. It is a single JSON block between `-----BEGIN EXPERIMENT SETUP-----` and `-----END EXPERIMENT SETUP-----`. The generator checks that the key and web configuration identify the same project. It does not create cloud resources, deploy, or change the source project.

Return the complete setup block directly in your final reply in the lab manager's private chat. Give it as one copyable text block with the deployment key and both boundary lines so the manager can forward it privately to the student for installation. Outside the block, link the private output file and state the project name, researcher contact, and database access model. Keep the block out of source files, issue trackers, public documentation, and logs. An agent can pass it to the installer through stdin or an owner-only file outside the project:

```bash
node scripts/create-experiment.mjs --file /absolute/private/path/my-experiment-setup.txt
```

The installer clones the recorded revision and its pinned core, starts independent Git history, writes the public project configuration and researcher contact, and uses the existing [persistent credential setup](../../operations/README.md#configure-firebase-authentication-once). It installs dependencies and runs typechecking. The private key stays in Git metadata, outside the tracked source and deployed assets. Setup does not deploy or recruit participants.

If setup stops after creating the project, preserve that folder and finish the reported installation step there. Use `--directory <new-folder>` when the student wants a different destination. Existing folders are never overwritten.

Prolific is connected later through the app's existing setup form. Its account token is not part of this Firebase/project handoff. The [researcher guide](../../internal/docs/DocsResearcher.vue) covers development, data checks, posting, and payments.
