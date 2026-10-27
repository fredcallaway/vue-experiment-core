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
        <b>Rich data recording and live data views.</b> Record participant actions in real time
        and define preprocessing alongside your experiment. Inspect raw events and analysis
        tables live, then save them to your computer. Refine the preprocessing later and
        apply it to data you have already collected.
      </li>
      <li>
        <b>Perfectly balanced condition assignment</b>, with tools to replace incomplete assignments.
      </li>
      <li>
        <b>Tools that help you and your coding agent catch mistakes:</b> reusable experiment
        components, working examples, agent-facing documentation, type checks, and automated browser tests.
      </li>
      <li>
        <b>Optional session recordings</b> to watch how participants experienced the task.
      </li>
    </ul>
    <p>
      Start with the guide to developing and running a study, whether you write code or use
      an agent. Technical explanations and examples follow.
    </p>
    <p>Use <b>Next</b> to read in order, or choose a page from the outline on the right.</p>
  </DocsPage>
</template>
