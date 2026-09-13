# 0009: Tracked Hosting deployment from the local CLI

Status: Accepted

## Context

The study UI already consumes `deployStatus` and records deployment SHA/version on studies. A bare Firebase upload leaves this metadata stale and can also deploy database rules. Agents need a tracked site deployment command that works with existing experiment code and configuration.

## Decision

The local CLI generates the static site and deploys only Firebase Hosting to the explicit configured project/site. It requires a clean committed checkout with matching submodules and checks that source identity remains unchanged after generation and upload. An operation-specific marker served from the site verifies the deployed identity before the CLI atomically updates the existing status/history fields, plus full Git provenance.

A local journal preserves the operation identity through failures. Reconciliation verifies that the same marker is still live before retrying the tracking write, without uploading again. Deployment and its helpers remain local CLI code; the browser and experiment interfaces do not change.

## Consequences

Hosting upload and database tracking cannot form one transaction, so partial failures require explicit reconciliation. Locks coordinate CLI deployments within the checkout; they do not serialize other machines or existing browser deployment actions. Existing single-site static Hosting consumers only need the updated core revision; no experiment-source migration is required.
