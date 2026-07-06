# Initialize Project

Firebase project setup can be completed from the CLI, but the first Realtime Database instance still needs the `firebase init database` flow.

Working CLI sequence:

```bash
firebase projects:create risky-choice-task --display-name "risky-choice-task"
firebase use risky-choice-task
firebase init database --project risky-choice-task
firebase apps:create web web --project risky-choice-task
firebase apps:sdkconfig web APP_ID --project risky-choice-task -o firebase.config.json
firebase deploy --only database --project risky-choice-task
```

Observed hiccups:

- `firebase database:instances:create risky-choice-task-default-rtdb --project risky-choice-task` failed for the first RTDB instance with: "It looks like you haven't created a Realtime Database instance in this project before. Please run firebase init database to create your default Realtime Database instance."
- Piping answers into `firebase init database --project risky-choice-task --json` was unreliable. It accepted the rules filename prompt, then exited at the first-database prompt with "User force closed the prompt with 0 null". Running the same command in a PTY and answering the prompts worked.
- `firebase init database` offered to overwrite `database.rules.json` with console-downloaded rules after creating the database. Declining kept the existing tracked rules; `firebase deploy --only database --project risky-choice-task` then published those rules successfully.
- Full `bun run deploy` did not reach Firebase deploy because `nuxt generate` failed in the project app: `components/EDebriefSurvey.vue (4:7): "default" is not exported by "components/EDebriefSurvey.vue?vue&type=script&lang.ts"`. This appears unrelated to Firebase initialization, but it blocks Hosting deployment until the component builds.
