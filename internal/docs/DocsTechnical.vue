<script lang="ts" setup>
import DocsPage from './DocsPage.vue'
import DocsEpochs from './DocsEpochs.vue'
import DocsComposition from './DocsComposition.vue'
import DocsData from './DocsData.vue'
import DocsConfig from './DocsConfig.vue'
import DocsPublishing from './DocsPublishing.vue'
import DocsDevtools from './DocsDevtools.vue'
import DocsFiles from './DocsFiles.vue'
import DocsExamples from './DocsExamples.vue'
</script>

<template>
  <ESequence name="technical">
    <DocsPage name="intro">
      <h2>Want to understand how it actually works?</h2>
      <p>
        The remaining pages explain how an experiment is built and how its parts fit together.
        Read on to understand the design behind your implementation, evaluate your agent's
        choices, or work directly with the code.
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
      <p>Read in order, or choose the technical topic you need from the outline.</p>
    </DocsPage>
    <DocsEpochs />
    <DocsComposition />
    <DocsData />
    <DocsConfig />
    <DocsPublishing />
    <DocsDevtools />
    <DocsFiles />
    <DocsExamples />
  </ESequence>
</template>
