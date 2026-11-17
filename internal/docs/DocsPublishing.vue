<script lang="ts" setup>
import DocsPage from './DocsPage.vue'
</script>

<template>
  <ESequence name="publishing">
    <DocsPage name="version">
      <h2>Publishing a fixed version</h2>
      <p>
        A published experiment should be traceable to the source participants actually ran.
        Commit your changes, then use the project's tracked deployment command,
        <code>bun run ops -- deploy run</code>, to publish to Firebase Hosting and verify the deployed source identity.
      </p>
      <p>
        Deployment requires a clean checkout with matching submodules. The Prolific create
        page compares the local commit with the recorded deployment before creating a study.
        Resolve a mismatch before recruiting against the intended build.
      </p>
      <p>
        The study's internal name includes the dataset version selected on the Prolific create page
        and the commit identifier. The commit identifies a source revision; the version
        identifies a participant procedure/data cohort. Keep the version through bugfix
        deployments before posting a study, and when recruiting another batch from unchanged
        code. After posting, increment it before changing the procedure or analysis.
      </p>
      <p>
        Deployment and study publication warn when a previously posted version has a different
        commit. Review the listed changes, then choose a new dataset version or explicitly
        acknowledge keeping the version. Documentation-only changes can also trigger this
        conservative warning. Check publication history manually for studies posted outside
        this dashboard. Replace the starter contact email before building or deploying.
      </p>
    </DocsPage>

    <DocsPage name="completion">
      <h2>Completion and recorded bonuses</h2>
      <p>
        <code>ECompletion</code> chooses a completion outcome: <code>COMPLETED</code>,
        <code>ERROR</code>, <code>ABORTED</code>, <code>TIMEOUT</code>, or
        <code>DISCONNECTED</code>. If data has not finished saving after 30 seconds, normal
        completion uses <code>DISCONNECTED</code> to distinguish a connection problem from an unfinished task.
      </p>
      <p>
        Completion codes are derived from the outcome type and experiment version and
        registered when creating a Prolific study. Aborted and timed-out submissions are
        marked for return; the other outcomes go to manual review. Codes identify outcomes
        within a version; the recorded deployment identifies the source revision.
      </p>
      <p>
        Include <code>ENoReturn</code> at the point after which a participant cannot restart.
        Review uses this boundary to distinguish partial data from an early exit.
      </p>
      <p>
        Tasks using <code>useBonus()</code> record the running bonus in session metadata.
        The Prolific review page reads that total, lets the researcher adjust it, and compares
        it with previous payments before paying the remaining amount.
      </p>
    </DocsPage>
  </ESequence>
</template>
