<script lang="ts" setup>
import DocsPage from './DocsPage.vue'
import DocsParams from './DocsParams.vue'
import DocsConditions from './DocsConditions.vue'
</script>

<template>
  <ESequence name="configuration">
    <DocsPage name="intro">
      <h2>Configuration</h2>
      <p>
        "Configuration" covers three different questions, and it's worth keeping them
        straight because they change on different timescales:
      </p>
      <ul>
        <li>
          <b>What is this app?</b> — title, icon, contact email, how the study ends. These are
          fixed for the project and live in <code>epoch.config.ts</code>.
        </li>
        <li>
          <b>How does this component behave?</b> — stimulus duration, colors, trial counts.
          These are <code>defineParams</code>: typed, defaulted, and overridable per instance
          or per subtree.
        </li>
        <li>
          <b>Which variant does this participant get?</b> — between-subject manipulations and
          counterbalancing. These are <code>useConditions</code>, assigned once per session.
        </li>
      </ul>
      <p>
        The three compose in one direction: conditions decide which participant gets what,
        and typically feed <em>into</em> params, which shape what a component renders. Keeping
        that arrow pointing one way is what makes a variant reproducible — pin the condition
        and everything downstream follows.
      </p>
      <h3>Project settings</h3>
      <p>
        <code>epoch.config.ts</code> at the project root holds app-level metadata, read
        anywhere via <code>useConfig()</code>:
      </p>
      <DemoCode code="
        export default defineEpochConfig({
          title: 'Psychology Experiment',
          icon: '/favicon.svg',
          version: '0.1',
          contactEmail: 'you@example.edu',
          completion: { mode: 'prolific' },
        })
      "/>
      <p>
        <code>version</code> is worth setting deliberately: it's recorded with every session
        and shown in the Prolific study's internal name, so it's how you tell a pilot's data
        from the real run.
      </p>
      <div card-info>
        Experiment-wide values that aren't app metadata — stimulus sets, block counts, shared
        constants — don't belong in <code>epoch.config.ts</code>. Put them in a project
        composable (e.g. <code>composables/useExperimentConfig.ts</code>) that returns them as
        one typed record, and call your <code>useConditions</code> assignment there too. That
        gives you a single place to answer "what is this session configured to do?"
      </div>
    </DocsPage>

    <DocsParams />
    <DocsConditions />
  </ESequence>
</template>
