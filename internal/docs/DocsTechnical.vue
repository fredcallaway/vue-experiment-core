<script lang="ts" setup>
import DocsPage from './DocsPage.vue'
</script>

<template>
  <DocsPage name="technical">
    <h2>Want to understand how it actually works?</h2>
    <p>
      The remaining pages explain how an experiment is built and how its parts fit together.
      Read on if you want to understand the design, work with a developer or coding agent,
      or change the experiment yourself.
    </p>
    <ul>
      <li><b>Epochs and composition:</b> arrange screens, trials, and blocks into an experiment.</li>
      <li><b>Recording data:</b> define the events a task records and turn them into analysis tables.</li>
      <li><b>Configuration:</b> set project details, adjust trial parameters, and assign conditions.</li>
      <li><b>Publishing:</b> connect a fixed experiment version to recruitment and completion.</li>
      <li><b>Devtools:</b> jump around a task and inspect its behavior while testing.</li>
      <li><b>Files and examples:</b> find the code and copy working patterns.</li>
    </ul>
    <p>
      Experiments use <a href="https://vuejs.org/" target="_blank" rel="noopener">Vue</a>
      components within <a href="https://nuxt.com/" target="_blank" rel="noopener">Nuxt</a>.
      If you plan to edit code, the
      <a href="https://vuejs.org/tutorial/" target="_blank" rel="noopener">Vue tutorial</a>
      introduces the basics. The examples in this app show the experiment-specific patterns.
    </p>
    <p>You can stop here if you only need the researcher workflow, or choose any technical topic from the outline.</p>
  </DocsPage>
</template>
