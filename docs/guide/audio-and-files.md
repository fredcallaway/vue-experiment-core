# Audio recording and file uploads

Use [`AudioExample.vue`](../../internal/examples/AudioExample.vue), available at `/examples/audio`, as the starting point. Copy its single-file [`AudioTrial.vue`](../../internal/examples/AudioTrial.vue) into your experiment's `ESequence` for live use. The example records, plays back, and saves an audio response; it retains the recording for retry after an upload failure. Transcription and task-specific scoring belong in your experiment.

## Record audio

Import `useAudioRecorder` from `core/composables/useAudioRecorder` inside component setup. Call `start()` from a participant click, after explaining microphone access. The browser must support `MediaRecorder` and `getUserMedia`, and the page must use HTTPS (localhost also works).

```ts
const audio = useAudioRecorder()
await audio.start()
// Later, after the participant clicks Stop or the task's timer expires:
const recording = await audio.stop()
// recording: { blob, durationMs, mimeType, extension }
```

The composable exposes `supported`, `status`, `error`, `recording`, and `playbackUrl` refs. Bind the playback URL to an `<audio controls>` element. `stop()` waits for the final recorded bytes; repeated stops return the same result. Empty recordings and device errors reject rather than producing a usable result. Measure task deadlines separately: `durationMs` measures recorder runtime, not speech onset or exact encoded audio duration.

The recorder chooses a supported format (WebM/Opus, MP4, then Ogg/Opus), with the browser's default as fallback. Use the returned extension and MIME type rather than assuming WebM. Options accept `audio` track constraints, `mimeType`, and `audioBitsPerSecond`.

Microphone tracks are released after stop, cancellation, failure, or component disposal. A permission grant arriving after navigation is released immediately. `cancel()` discards the current attempt and revokes playback; starting another recording also discards the previous attempt. Playback URLs are revoked on disposal. Retain a Blob yourself if it must outlive its component.

Use `useLocalAsync().registerAsync(...)` around awaited recording and upload calls in components so their continuations cannot run after navigation. Gate clicks while a start, stop, or save is pending, as in the example.

## Enable Firebase Storage for a project

Storage is optional; the normal Hosting/Realtime Database setup does not provision it. Configure it before deploying an experiment that uploads files:

1. In the Firebase console for the experiment's project, enable the **Blaze** billing plan and create a default **Storage** bucket in the appropriate research region. [Firebase's setup guide](https://firebase.google.com/docs/storage/web/start) documents the billing requirement and bucket creation.
2. Set `storageBucket` in the project's `firebase.config.json` to the exact bucket name shown in the console. New and older buckets use different name formats; copy the actual name.
3. Enable **Authentication → Sign-in method → Anonymous**. The upload helper signs in automatically when a live upload first needs authentication; participants do not create accounts. See [anonymous authentication](https://firebase.google.com/docs/auth/web/anonymous-auth).
4. Copy `core/operations/storage.rules` to `storage.rules` in the project root, and add `"storage": { "rules": "storage.rules" }` to the top level of `firebase.json`.
5. As a project administrator, deploy the reviewed rules with `firebase deploy --only storage --project <project-id>`. The standard project deployment key grants Hosting permissions; it does not grant Storage administration. Normal tracked site deployments remain Hosting-only.

The supplied rules allow authenticated browsers to create or replace nonempty files of up to 50 MiB only beneath their own UID. Client reads, listing, and deletion are denied. Researchers play recordings in the local Data dashboard through the project's service-account credentials, as described below. These rules isolate browser identities, not verified Prolific participants; anonymous signup and upload volume remain subject to your project's abuse controls and quotas. This optional Storage setup does not change Realtime Database rules or the event-data access model.

For an existing bucket, review and merge its rules rather than replacing rules needed by other applications. The supplied rules apply to the `sessions/` namespace used by this helper; existing recordings keep their original paths and formats.

## Save a session file

Use `uploadAudio` for recorded audio. The acknowledged `AudioFile` is a JSON-safe reference you can log in an event and return in one cell of a data view:

```ts
const { uploadAudio } = useFirebaseStorage()
const audioFile = await uploadAudio(filename, recording)
if (audioFile) logResponse({ audio: audioFile })
```

Choose the filename once per attempt and reuse it for retries. `uploadAudio` returns `null` in an uninitialized preview; a failed initialized upload rejects. The file index under `other/files` keeps size, content type, recorder MIME type, and duration with the reference. A data view should return one row per trial with the reference in an audio column. Tables display Play/Stop, and processed CSV and JSON exports replace the reference with a relative filesystem path. See the live `AudioTrial.vue` example for a complete trial.

Import `useFirebaseStorage` from `core/composables/useFirebaseStorage` in setup. It accepts any nonempty Blob up to `MAX_UPLOAD_BYTES` (50 MiB). Choose a filename once per response and reuse it for upload retries:

```ts
const { upload } = useFirebaseStorage()
const filename = `response-${crypto.randomUUID()}.${recording.extension}`
const result = await upload(filename, recording.blob)
if (result.saved) {
  // Log result.path and the recording metadata using your task's typed event logger.
  // Only now allow this live trial to advance.
}
```

Live files are stored as `sessions/<Firebase UID>/<encoded session ID>/<encoded filename>`. Debug files use `debug.<encoded session ID>` for the session directory, keeping their files separate while using the same Storage rules. The object has session, participant, study, and mode metadata, plus version and deployment identity when running a tracked build. Local debug runs have no dataset version. The returned `{ saved: true, path, bucket, size, contentType }` is available only after Firebase acknowledges the upload. Successful uploads also queue this metadata under the session's `other/files` index, which makes audio discoverable in the Data dashboard without requiring a custom data view. Debug indexes and events use the database's `debug/` namespace; live data uses `live/`. Keep task-specific context in semantic events and component-local data views. The helper does not create public download URLs or store audio bytes in the event database.

Initialized debug and live sessions both upload files and require a writable data writer for the same session. Disabled and superseded sessions reject, as do authentication, configuration, permission, and upload failures. Preserve the Blob and filename, display a retry action, and keep advancement blocked until `saved` is true. Reusing a filename replaces that file for the same UID, mode, and session, so use a different filename for each distinct response or recording attempt.

Uninitialized debug previews, including `/examples/audio`, and outline jumps return `{ saved: false, path: null }` without opening a Firebase connection or signing in. To save a debug session, use `/dev?mode=debug&session_id=<session ID>` or `/exp?mode=debug&session_id=debug<session ID>`. An uninitialized live session rejects. Event saving and acknowledgment work in both modes; only live sessions retain pending events in local recovery storage across reloads. Audio Blobs themselves are held only in memory.

Recording and upload are separate operations. A recording is held in browser memory until you upload it; event recovery storage does not include Blobs. A reload discards an unsaved recording. `ECompletion` confirms event saving only; your recording component must await its own uploads before calling `done()`.

## Play recordings in the Data dashboard

Open a session or version under **Data**, then select **audio** or a data view with an audio column. The recording list can be filtered by session, participant, filename, or epoch. Play/Stop stays in its row and recordings load only on request. Loading failures offer Retry. Switching tabs or leaving the page stops playback and releases its Blob URL.

Playback uses the local Nuxt server started by `bun run dev`. The server reads the configured bucket with the project's service-account key; it keeps credentials on the server and streams bytes to the local browser. The participant-facing static Firebase site does not provide this researcher endpoint. Storage rules can continue denying client reads. Google Cloud IAM separately authorizes the service account's reads.

Configure the project key once with `bun run ops -- firebase-auth configure --key <file>`, as for deployments. An administrator must also grant that service account **Storage Object Viewer** (`roles/storage.objectViewer`) on the experiment's bucket. This can be a bucket-scoped grant; see [Cloud Storage read permissions](https://docs.cloud.google.com/storage/docs/reading-objects). The standard Hosting-only account needs this additional permission for playback. No new key is needed when granting the role to an already configured account. The dashboard reports missing credentials or missing object-read permission when a recording is selected.

The Audio tab reads the automatic file index and existing event payloads containing successful upload results. Existing fluency events using `audio_path` and `audio_mime_type` also remain readable. Duplicate references to the same bucket/path produce one entry, and raw session data and analysis exports remain unchanged. Files must be in the bucket configured for this project; the dashboard does not read arbitrary buckets or create shared download links.

Saving a live version or an individual debug session also downloads its recordings under `data/raw/<mode>/audio/<Storage path>`. Filenames and UUIDs match the saved event's `path`; the full Storage path keeps recordings from different sessions distinct. Complete files are reused without another Storage request. Missing or incomplete files are downloaded through the same project credentials and atomically installed after validation. Save reports a download failure and can be retried. Browsing data and on-demand playback do not trigger this filesystem download.

## Verify before collection

Run `bun test core/composables/useAudioRecorder.test.js core/composables/useFirebaseStorage.test.js` for recorder lifecycle and upload-acknowledgement regressions. Run `node core/testing/audio.integration.mjs` for Chromium's real MediaRecorder/playback flow with a synthetic microphone in an isolated local fixture. The latter saves evidence under `.experiment-tests/audio/` and blocks external requests. It also accepts an existing local example URL as its first argument.

Run `bun test core/internal/session-audio.test.js core/operations/storage-reader.test.js` for file discovery and the authenticated playback endpoint, and `node core/testing/audio-data.integration.mjs` for session/version playback, filtering, permission errors/retry, and cleanup. The browser suite uses synthetic sessions and audio, blocks external requests, and saves evidence under `.experiment-tests/audio-data/`.

Test microphone denial and retry, stop/playback, a deadline, and navigation while permission is pending or recording is active. On a live test deployment, confirm an acknowledged file in the bucket and its path in the corresponding session events. Then simulate a failed upload and verify that retry succeeds without losing the recording or advancing early. Check the deployed rules against unauthenticated access and another browser identity. Synthetic microphone tests validate recording mechanics; test real participant audio and the deployed Firebase configuration separately.
