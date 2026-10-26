# 0013 — Acknowledged session flushes

Status: Accepted

## Context

Participant completion needs proof that its completion event and session metadata reached the database. A resolved asynchronous operation can also represent a skipped or failed write. Firebase's update promise provides the required acknowledgment; browser connectivity and an empty local queue alone do not.

Completion can start while a debounced write is already in flight. Its new event and metadata are absent from that earlier snapshot. Concurrent writes can also carry different values for the same metadata or auxiliary-data paths.

## Decision

`DataWriter.flush()` returns `true` only after Firebase acknowledges that call's snapshot, including the full current session metadata, while the writer is still enabled and owns its session. Expected failures and skipped writes return `false`. The caller must check this result before declaring a successful save.

All explicit, debounced, reconnect, and unload flushes share one serialization boundary. A caller waiting on an earlier successful write takes a fresh snapshot afterward. A failed predecessor returns `false` to its waiting callers; a later retry takes a fresh snapshot.

The live recovery queue retains in-flight data and synchronizes local storage immediately. Acknowledgment removes only queued path/value pairs still equal to the acknowledged snapshot. Newer updates remain pending. Every attempt queues current metadata before checking connectivity, so an offline completion also preserves its metadata locally. Raw database paths, event encoding, and recovery-storage shape remain unchanged.

Flush failures use console diagnostics instead of the event writer. Logging an event through a failing writer would schedule another write and recursively embed prior failed batches in the error payload. Retry is initiated by new data, reconnection, or an explicit request.

## Consequences

Shared completion owns its save attempt and retries on reconnection or participant request. It exposes the existing failure completion route after the existing wait and shows normal completion only after a successful flush. Development runs keep their explicit debug-save flow.

Callers that make no success claim, such as unload handling and consent-abort routing, can ignore the boolean. A flush does not guarantee that changes queued after its snapshot have been acknowledged, nor does it retract a write already sent when a different client takes ownership. Local recovery is subject to browser storage availability and the existing abandoned-queue policy.

The persistence regression suite mounts the compiled completion component with the real writer and controlled database acknowledgments. This checks queue retention and visible success together; synthetic participant-flow tests with an uninitialized writer do not establish persistence correctness.
