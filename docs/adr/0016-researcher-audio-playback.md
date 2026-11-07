# Researcher audio playback through the local dashboard

Status: Accepted

The session and version Data pages load recordings through the local Nuxt server. That server authenticates with the configured project service-account key and uses Google Cloud IAM object-read permission for the configured Storage bucket. Its recording endpoint accepts only loopback, same-origin requests, returns file bytes with private/no-store caching, and keeps credentials on the server. The deployed participant-facing static site does not supply this endpoint.

Nuxt's development worker forwards requests without their native socket address. Development accepts its forwarded loopback address; a direct Node server uses the native address. Browser origin checks apply in both cases.

Firebase Anonymous authentication identifies the browser that uploads a file; it does not establish researcher access. The participant Storage rules therefore continue allowing writes under the uploader UID while denying reads. Researcher playback is authorized separately with `roles/storage.objectViewer`, which can be scoped to the experiment bucket.

An acknowledged upload queues its file descriptor in the session's `other/files` index. The Data pages can discover recordings independently of project-specific event names or data views. Semantic events and their component-local analysis transforms remain owned by the trial. Existing upload descriptors and fluency audio-path events are also read without modifying stored sessions or exports.

An `AudioFile` value in a trial event or data view identifies an acknowledged upload by bucket and Storage path. File metadata belongs in the file index; the reference remains small and JSON-safe. The same reference plays in a table cell and becomes a relative path in a processed export. Save materializes missing recordings under the mode's local audio directory, retaining the original Storage path and filename so exports can be moved with their data directory.
