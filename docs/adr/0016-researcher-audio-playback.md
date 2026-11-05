# Researcher audio playback through the local dashboard

Status: Accepted

The session and version Data pages load recordings through the local Nuxt server. That server authenticates with the configured project service-account key and uses Google Cloud IAM object-read permission for the configured Storage bucket. Its recording endpoint accepts only loopback, same-origin requests, returns file bytes with private/no-store caching, and keeps credentials on the server. The deployed participant-facing static site does not supply this endpoint.

Firebase Anonymous authentication identifies the browser that uploads a file; it does not establish researcher access. The participant Storage rules therefore continue allowing writes under the uploader UID while denying reads. Researcher playback is authorized separately with `roles/storage.objectViewer`, which can be scoped to the experiment bucket.

An acknowledged upload queues its file descriptor in the session's `other/files` index. The Data pages can discover recordings independently of project-specific event names or data views. Semantic events and their component-local analysis transforms remain owned by the trial. Existing upload descriptors and fluency audio-path events are also read without modifying stored sessions or exports.
