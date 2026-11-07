# 0018: Dataset versions belong to deployments; debug data belongs to sessions

Status: Accepted

## Decision

Researchers choose the dataset version on Prolific's Create New Study page. The selection is stored in `deploymentVersion`, outside Git. Tracked deployment embeds its version, source SHA, and operation identity in the generated build. Participant session metadata and completion codes use that loaded identity. Study drafts receive the deployed version, and publication checks it against the current deployment and selected dataset. This replaces configuration-based version ownership in [ADR 0014](0014-posted-version-deployment-warning.md); its posted-version warnings and explicit reuse acknowledgment remain in effect.

A live dataset may contain several recruitment batches and repeated deployments of the same source. Pre-posting fixes can retain the planned version; changes to the procedure or analysis after recruitment normally require a new version. Session provenance preserves the actual deployment even when a researcher deliberately keeps a version across a source change. Restarting an existing session with known different deployment provenance is rejected.

Local development has no dataset version. Debug sessions on a tracked build retain its provenance in metadata, but all debug sessions use one chronological list, without version navigation or grouping. Debug exports contain one session and its registered views under `data/processed/debug/<session-id>/`. Live exports remain grouped by version. Existing raw data and legacy version labels stay readable without migration.

## Rationale

Dataset naming is a human collection decision. The recruitment interface is the place researchers reliably review before launching collection, and a descriptive name should not require a source commit. Deployment binds that name to the code participants actually load; a mutable dashboard setting cannot provide equivalent provenance to an already running session.

Debug data serves session-by-session inspection. Both hosted and local tests belong in that workflow, and local sessions can span unrelated code states or incompatible event schemas. Version metadata on a hosted test describes what was tested without making it part of the live dataset or creating a separate debug dataset.

## Compatibility

Older `epoch.config.ts` version fields remain accepted but are ignored. A selected version is required for tracked deployment; the CLI can supply it explicitly with `--version`. Existing debug labels do not establish whether the code was local or deployed, so no provenance is inferred from them. Raw session and file paths retain their existing mode/session structure.
