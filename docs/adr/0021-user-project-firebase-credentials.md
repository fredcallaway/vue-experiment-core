# Per-user Firebase project credentials

Status: Accepted

## Decision

Store configured service-account keys under `~/.config/experiment-template/firebase/<project-id>/`, independently of checkout location and shell `XDG_CONFIG_HOME`. Resolve the Firebase project ID from `firebase.config.json` on every operation. Use the saved matching key when present; otherwise inherit shell credentials. Registering a key expresses the intent to use it, so there is no authentication preference or source selector.

Keep project directories private (0700), key files private (0600), and replace keys atomically. An existing shared directory whose key is missing or invalid is a broken registration and must fail with a reconfiguration instruction. Preserve the isolated Firebase CLI configuration and cleared `FIREBASE_TOKEN` used with a project key. Import validated legacy Git-metadata keys only when a shared registration is absent; never let a stale checkout copy override a shared rotation.

The researcher deployment page polls safe source metadata without exposing keys or environment variables. CLI and dashboard errors identify the same selected source, retain sanitized original diagnostics, and suggest configuring a missing project key for shell authentication/permission failures.

## Rationale

Git metadata disappears when a checkout is deleted and is absent from a fresh clone. Firebase project identity is already tracked and provides the required shared lookup key. Per-operation resolution supports fresh shells, concurrent checkouts, and key rotation without exports or a dashboard restart. Explicit source visibility makes shell fallback and Firebase permission failures diagnosable while retaining researchers' existing shell authentication.
