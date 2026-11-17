# Set up Firebase independently

If you have a setup block from your lab manager, follow the [README](../../../README.md#create-your-experiment). If you are using the template independently, create your own Firebase resources and generate a block for yourself. An agent can help with this procedure; you will need your own Google account and must complete its authentication and terms prompts.

Keep a clean checkout of the template, including its core submodule. Create a separate provisioning directory outside that checkout and copy the template's `firebase.json` and `database.rules.json` into it. Run the Firebase commands below from that provisioning directory. Keeping the template checkout unchanged lets the setup block refer to its published revision.

Experiments that upload audio or other files also need the optional [Firebase Storage setup](audio-and-files.md#enable-firebase-storage-for-a-project), including a bucket, anonymous authentication, and Storage rules.

## Create the project and database

Install the [Firebase CLI](https://firebase.google.com/docs/cli), sign in, and choose a unique project ID:

```bash
npm install --global firebase-tools
firebase login
EXPERIMENT_FIREBASE_PROJECT_ID="your-experiment-project-id"
firebase projects:create "$EXPERIMENT_FIREBASE_PROJECT_ID" --display-name "My experiment"
firebase use --add
```

When selecting the project, choose the one you just created and use `default` as its alias. Then create its first Realtime Database:

```bash
firebase init database --project "$EXPERIMENT_FIREBASE_PROJECT_ID"
```

Choose a database region appropriate for your research and record the database URL. Run the first-database prompts interactively; see the [CLI setup notes](../hiccups/initialize-project.md) if needed. Review the resulting `firebase.json` and `database.rules.json`.

Database access is controlled by its rules, separately from Hosting credentials. The template's included rules currently allow public reads and writes; select and deploy rules appropriate for your project before recording participant data. The current app and data tools use unauthenticated database requests, so fully locked rules will prevent those operations. See [Firebase's database setup and rules guide](https://firebase.google.com/docs/database/web/start).

## Register the web app

```bash
firebase apps:create WEB experiment --project "$EXPERIMENT_FIREBASE_PROJECT_ID"
```

Copy the returned App ID into the following command. Download the complete configuration to a new temporary file, then copy it into the provisioning directory:

```bash
EXPERIMENT_FIREBASE_APP_ID="your-web-app-id"
EXPERIMENT_FIREBASE_CONFIG_DIR="$(mktemp -d)"
firebase apps:sdkconfig WEB "$EXPERIMENT_FIREBASE_APP_ID" --project "$EXPERIMENT_FIREBASE_PROJECT_ID" --out "$EXPERIMENT_FIREBASE_CONFIG_DIR/firebase.config.json"
cp "$EXPERIMENT_FIREBASE_CONFIG_DIR/firebase.config.json" firebase.config.json
```

Confirm that `projectId`, `appId`, and `databaseURL` identify your new resources. If the database URL is missing, add its exact URL from the database-creation step. The web configuration is public and can be committed; it is separate from the private deployment key below. See the [Firebase CLI reference](https://firebase.google.com/docs/cli#project_management_commands).

List the project's Hosting sites with `firebase hosting:sites:list --project "$EXPERIMENT_FIREBASE_PROJECT_ID"`. Use its default site, named after the project ID. If it does not yet exist, create it with `firebase hosting:sites:create "$EXPERIMENT_FIREBASE_PROJECT_ID" --project "$EXPERIMENT_FIREBASE_PROJECT_ID"`. Keep the template's `.output/public` Hosting directory and single-page-app rewrite in `firebase.json`.

## Create deployment credentials

Using the [Google Cloud CLI](https://docs.cloud.google.com/sdk/docs/install), authenticate with the same project-owning account. Create a dedicated service account, grant the two project-scoped Hosting roles used by this template, and write its key to a private temporary directory:

```bash
gcloud auth login
gcloud services enable iam.googleapis.com --project "$EXPERIMENT_FIREBASE_PROJECT_ID"
gcloud iam service-accounts create experiment-deployer --project "$EXPERIMENT_FIREBASE_PROJECT_ID"
EXPERIMENT_FIREBASE_SERVICE_ACCOUNT="experiment-deployer@$EXPERIMENT_FIREBASE_PROJECT_ID.iam.gserviceaccount.com"
gcloud projects add-iam-policy-binding "$EXPERIMENT_FIREBASE_PROJECT_ID" --member "serviceAccount:$EXPERIMENT_FIREBASE_SERVICE_ACCOUNT" --role roles/firebasehosting.admin
gcloud projects add-iam-policy-binding "$EXPERIMENT_FIREBASE_PROJECT_ID" --member "serviceAccount:$EXPERIMENT_FIREBASE_SERVICE_ACCOUNT" --role roles/serviceusage.apiKeysViewer
EXPERIMENT_FIREBASE_KEY_DIR="$(mktemp -d)"
gcloud iam service-accounts keys create "$EXPERIMENT_FIREBASE_KEY_DIR/service-account.json" --iam-account "$EXPERIMENT_FIREBASE_SERVICE_ACCOUNT" --project "$EXPERIMENT_FIREBASE_PROJECT_ID"
chmod 600 "$EXPERIMENT_FIREBASE_KEY_DIR/service-account.json"
```

Google documents [service-account creation and role grants](https://docs.cloud.google.com/iam/docs/service-accounts-create) and [key creation](https://docs.cloud.google.com/iam/docs/keys-create-delete). Organization policies may restrict account or key creation; resolve those permissions with the project owner if a command is denied.

## Generate your setup block

Return to the clean template checkout. Follow [Prepare a student handoff](student-handoff.md), using your provisioning directory as `--project`, your participant-facing researcher email, and the new key file with `--key`. Write the block outside Git repositories; the private directory above can hold it.

The template revision and its pinned core must be published at their clone URLs. Use a clean checkout of a published release for independent setup. Once the block is ready, return to the [README](../../../README.md#create-your-experiment) and use it to create your experiment. The provisioning directory is only a source of settings; the installer creates the final experiment checkout with its own Git history.
