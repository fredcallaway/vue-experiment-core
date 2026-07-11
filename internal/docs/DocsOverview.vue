<script lang="ts" setup>
import DocsPage from './DocsPage.vue'
</script>

<template>
  <ESequence name="overview">
    <DocsPage name="intro">
      <h2>Hello there!</h2>
      <p>
        This template is a <a href="https://nuxt.com" target="_blank" rel="noopener">Nuxt 3</a>
        framework for building online behavioral experiments in
        <a href="https://vuejs.org/" target="_blank" rel="noopener">Vue</a> and running them
        on <a href="https://www.prolific.com/" target="_blank" rel="noopener">Prolific</a>.
      </p>
      <div card-info>
        New to Vue? The
        <a href="https://vuejs.org/tutorial/" target="_blank" rel="noopener">official tutorial</a>
        is a good 20-minute introduction. You only need the basics (and maybe some help from a coding agent).
      </div>
      <p>
        Compared to other web experiment frameworks like
        <a href="https://www.jspsych.org/latest/" target="_blank" rel="noopener">jsPsych</a> and
        <a href="https://smile.gureckislab.org/" target="_blank" rel="noopener">Smile</a>,
        this template is broader in scope and stronger in opinion. It is an <b>end to end system</b>, providing:
      </p>
      <ul>
        <li>
          a place to host your experiment online and store your data (using
          <a href="https://firebase.google.com/" target="_blank" rel="noopener">Firebase</a>)
        </li>
        <li>
          a custom Prolific interface that syncs with participant data for automatic bonus payments
        </li>
        <li>
          interactive live views of your data, updated every 5 seconds
        </li>
        <li>
          a hierarchical <b>epoch</b> system for composing experiments like you write outlines
        </li>
        <li>
          a developer interface, including jumping to any moment in your experiment in one click
        </li>
        <li>
          perfectly balanced condition assignment with exclusion-aware replacement
        </li>
        <li>
          universal type safety to catch mistakes <em>before</em> you run the experiment
        </li>
        <li>
          (optional) integration with
          <a href="https://posthog.com/" target="_blank" rel="noopener">PostHog</a>
          to watch videos of participants doing your task
        </li>
      </ul>
      <p>
        Interested? Click next to learn more.
      </p>
    </DocsPage>

    

    <!-- TODO move this to after devtool and expand to cover the full file structure (not inside core/) -->
    <DocsPage name="files">
      <h3>Where things live</h3>
      <ul>
        <li>
          <code>components/Experiment.vue</code> — your experiment. The top-level sequence of
          everything the participant sees.
        </li>
        <li>
          <code>components/</code> — your trial components, consent form, surveys.
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
