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

The supplied rules allow authenticated browsers to create or replace nonempty files of up to 50 MiB only beneath their own UID. Client reads, listing, and deletion are denied; researchers retrieve files through the Firebase console or authenticated Google Cloud tools. These rules isolate browser identities, not verified Prolific participants; anonymous signup and upload volume remain subject to your project's abuse controls and quotas. This optional Storage setup does not change Realtime Database rules or the event-data access model.

For an existing bucket, review and merge its rules rather than replacing rules needed by other applications. The supplied rules apply to the `sessions/` namespace used by this helper; existing recordings keep their original paths and formats.

## Save a session file

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

Files are stored as `sessions/<Firebase UID>/<encoded session ID>/<encoded filename>`. The object has session, participant, study, and experiment-version metadata. The returned `{ saved: true, path, bucket, size, contentType }` is available only after Firebase acknowledges the upload. Keep it in a semantic event and expose the path in a component-local data view. The helper does not create public download URLs or store audio bytes in the event database.

Development/debug runs and outline jumps return `{ saved: false, path: null }` without opening a Firebase connection or signing in. A live run requires a writable initialized data writer for the same session; uninitialized, disabled, and superseded live sessions reject. Authentication, configuration, permission, and upload failures also reject. Preserve the Blob and filename, display a retry action, and keep live advancement blocked until `saved` is true. Reusing a filename replaces that file for the same UID and session, so use a different filename for each distinct response or recording attempt.

Recording and upload are separate operations. A recording is held in browser memory until you upload it; event recovery storage does not include Blobs. A reload discards an unsaved recording. `ECompletion` confirms event saving only; your recording component must await its own uploads before calling `done()`.

## Verify before collection

Run `bun test core/composables/useAudioRecorder.test.js core/composables/useFirebaseStorage.test.js` for recorder lifecycle and upload-acknowledgement regressions. Run `node core/testing/audio.integration.mjs` for Chromium's real MediaRecorder/playback flow with a synthetic microphone in an isolated local fixture. The latter saves evidence under `.experiment-tests/audio/` and blocks external requests. It also accepts an existing local example URL as its first argument.

Test microphone denial and retry, stop/playback, a deadline, and navigation while permission is pending or recording is active. On a live test deployment, confirm an acknowledged file in the bucket and its path in the corresponding session events. Then simulate a failed upload and verify that retry succeeds without losing the recording or advancing early. Check the deployed rules against unauthenticated access and another browser identity. Synthetic microphone tests validate recording mechanics; test real participant audio and the deployed Firebase configuration separately.
