# 0014: Warn on changed code under a posted experiment version

Status: Accepted

## Decision

Use the most recent stored study publication (`publishTime`) for a version and its source SHA to detect reuse with changed or unknown code. Deployment inspection returns the evidence; deployment and publication require an explicit acknowledgment to continue. A warning cannot be suppressed by the separate Git/deployment bypasses. Placeholder contact information is a hard error, including during production generation/build.

The website upload paths share the tracked Hosting operation from ADR 0009. Publication records the build deployed at publication time, because draft creation may precede several legitimate bugfix deployments. Legacy short SHAs remain comparable with full SHAs; no raw-data migration is needed.

## Rationale

Deploying is not posting: researchers need to fix and redeploy an unposted experiment without consuming versions. Additional batches from the same published source also belong to the same version. The version identifies a participant procedure/data cohort; the SHA identifies a source revision.

A commit mismatch is evidence to review, not proof that participant behavior changed. Documentation and harmless fixes can change the SHA, so explicit override is supported. Comparing against the latest publication prevents an intentionally retained version from warning forever on subsequent batches of that same build. Missing historical SHAs warn rather than silently establishing sameness. History outside the dashboard cannot be inferred and requires a manual check. No Prolific mutation is exposed through the agent CLI.
