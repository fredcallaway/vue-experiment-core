<script lang="ts" setup>
import DocsPage from './DocsPage.vue'
</script>

<template>
  <ESequence name="overview">
    <DocsPage name="intro">
      <h2>Overview</h2>
      <p>
        This template is a <a href="https://nuxt.com" target="_blank" rel="noopener">Nuxt 3</a>
        framework for building online behavioral experiments. You write your experiment as Vue
        components; the template provides the structure (epochs), data recording (events and
        data views), participant management (Prolific), and developer tooling.
      </p>
      <div card-info>
        New to Vue? The
        <a href="https://vuejs.org/tutorial/" target="_blank" rel="noopener">official tutorial</a>
        is a good 20-minute introduction; you only need the basics.
      </div>
      <p>
        These docs are themselves an epoch tree: the outline on the right is the table of
        contents — click any entry to jump to it, or use the Next buttons to read in order.
      </p>
    </DocsPage>

    <DocsPage name="files">
      <h3>Where things live</h3>
      <ul>
        <li>
          <code>components/Experiment.vue</code> — your experiment. The top-level sequence of
          everything the participant sees.
        </li>
        <li>
          <code>components/</code> — your trial components, consent content, surveys.
        </li>
        <li>
          <code>epoch.config.ts</code> — project configuration (title, completion mode, extra
          nav pages).
        </li>
        <li>
          <code>core/</code> — the template layer. Owned by the template; don't edit it from a
          project unless you're making a template change.
        </li>
      </ul>
      <p>
        The <NuxtLink to="/examples">examples</NuxtLink> are live, minimal reference
        implementations of every major pattern; each section here links to the relevant ones.
      </p>
    </DocsPage>
  </ESequence>
</template>
