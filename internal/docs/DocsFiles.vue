<script lang="ts" setup>
import DocsPage from './DocsPage.vue'
</script>

<template>
  <DocsPage name="files">
    <h2>Where things live</h2>
    <p>
      A project is a thin layer on top of the template. Almost everything you write goes in
      <code>components/</code>; the rest of the root is configuration you touch once.
    </p>
    <h3>Your experiment</h3>
    <ul>
      <li>
        <code>components/Experiment.vue</code> — the top-level sequence: everything a
        participant sees, in order. Start here when reading an unfamiliar project.
      </li>
      <li>
        <code>components/</code> — everything else you write: trial components, the consent
        form, surveys, instructions. Nuxt autoimports these, so no import statements.
      </li>
      <li>
        <code>composables/</code> — shared logic and experiment-wide configuration
        (e.g. <code>useExperimentConfig.ts</code>). Also autoimported.
      </li>
      <li>
        <code>assets/</code> and <code>public/</code> — stimuli and static files. Anything
        under <code>public/</code> is served at the matching URL.
      </li>
    </ul>

    <h3>Configuration</h3>
    <ul>
      <li>
        <code>epoch.config.ts</code> — app metadata: title, icon, version, contact email,
        completion mode.
      </li>
      <li>
        <code>preprocessing.ts</code> — data views that aren't owned by a single component.
        Ships with a <code>timing</code> view that reports time spent in each top-level
        section.
      </li>
      <li>
        <code>plugins/00.config.ts</code> — runs before anything mounts. It imports
        <code>epoch.config.ts</code>; if you add a global config composable, initialize it
        here too.
      </li>
      <li>
        <code>firebase.json</code>, <code>database.rules.json</code>,
        <code>firebase.config.json</code> — hosting and database. Set up once per project.
      </li>
      <li>
        <code>nuxt.config.ts</code>, <code>uno.config.ts</code>, <code>tsconfig.json</code> —
        build configuration. Rarely edited.
      </li>
    </ul>

    <h3>The template layer</h3>
    <ul>
      <li>
        <code>core/</code> — the template itself, included as a Nuxt layer: the epoch
        components, composables, the dev and Prolific interfaces, and these docs. It's owned
        by the template and shared across projects, so don't edit it from a project unless
        you're deliberately making a template change.
      </li>
      <li>
        <code>data/</code> — downloaded experiment data. Never edited by hand.
      </li>
    </ul>
    <p>
      Because <code>core/</code> is a layer, anything in it can be overridden by putting a
      file at the same path in your project — a project <code>components/EConsent.vue</code>
      shadows the template's. Prefer this over editing <code>core/</code>: overrides survive
      template updates, edits don't.
    </p>
    <p>
      The <NuxtLink to="/examples">examples</NuxtLink> are live, minimal reference
      implementations of every major pattern; their source is in
      <code>core/internal/examples/</code>.
    </p>
  </DocsPage>
</template>
