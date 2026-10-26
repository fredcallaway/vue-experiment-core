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
        <code>bun run deploy</code>, to publish to Firebase Hosting and verify the deployed source identity.
      </p>
      <p>
        Deployment requires a clean checkout with matching submodules. The Prolific create
        page compares the local commit with the recorded deployment before creating a study.
        Resolve a mismatch before recruiting against the intended build.
      </p>
      <p>
        The study's internal name includes <code>version</code> from <code>epoch.config.ts</code>
        and the commit identifier. The commit identifies a source revision; the version
        identifies a participant cohort. After collecting data under a version, increment it
        before collecting data from a meaningfully different procedure.
      </p>
      <p>
        The create page's preview link supplies debug participant identifiers and
        <code>assignment=0</code>. Test that deployed copy before publishing the study.
      </p>
    </DocsPage>

    <DocsPage name="completion">
      <h3>Completion and recorded bonuses</h3>
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
