<script lang="ts" setup>
import DocsPage from './DocsPage.vue'
</script>

<template>
  <DocsPage name="overview">
    <h2>Welcome!</h2>
    <p>
      This template provides everything you need to run an online experiment through
      <a href="https://www.prolific.com/" target="_blank" rel="noopener">Prolific</a>.
      Compared to other web experiment frameworks like
      <a href="https://www.jspsych.org/" target="_blank" rel="noopener">jsPsych</a> and
      <a href="https://smile.gureckislab.org/" target="_blank" rel="noopener">Smile</a>,
      this template is broader in scope and stronger in opinion. It is an end to end system, providing:
    </p>
    <ul>
      <li>
        <b>A website and database</b> through
        <a href="https://firebase.google.com/pricing" target="_blank" rel="noopener">Firebase</a>,
        free within its usage limits.
      </li>
      <li>
        <b>Prolific study management</b> to create studies, monitor recruitment, and pay
        participants, with automatic bonus calculation and partial-completion detection.
      </li>
      <li>
        <b>An interactive experiment outline</b> that lets you jump to different sections in one click.
      </li>
      <li>
        <b>Real-time recording</b> of every participant action, with live previews of tidy
        analysis tables that sync to your computer as CSVs.
      </li>
      <li>
        <b>Perfectly balanced condition assignment</b>, with tools to replace incomplete assignments.
      </li>
      <li>
        <b>Tools that help you and your coding agent avoid errors:</b> reusable experiment
        components, working examples, agent-facing documentation, type checking, and automated browser tests.
      </li>
      <li>
        <b>Optional session recordings</b> with
        <a href="https://posthog.com/session-replay" target="_blank" rel="noopener">Posthog</a>
        to see how participants experienced the task.
      </li>
    </ul>
    <p>
      Setting up your first experiment? Follow the
      <a
        href="https://github.com/fredcallaway/vue-experiment-template/blob/main/README.md#create-your-experiment"
        target="_blank" rel="noopener"
      >student setup instructions</a>
      in the template README. Your lab manager provides a setup block for your experiment.
    </p>
    <p>
      Start with the guide to developing and running a study, whether you write code or use
      an agent. Technical explanations and examples follow.
    </p>
    <p>Use <b>Next</b> to read in order, or choose a page from the outline on the right.</p>
  </DocsPage>
</template>
