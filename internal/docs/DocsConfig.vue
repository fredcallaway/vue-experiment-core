<script lang="ts" setup>
import DocsPage from './DocsPage.vue'
</script>

<template>
  <DocsPage name="configuration">
    <h2>Params and conditions</h2>
    <p>Two mechanisms make an experiment configurable and counterbalanced:</p>
    <ul>
      <li>
        <b><code>defineParams</code></b> — typed, defaulted settings for a component,
        overridable per instance via a <code>params</code> prop or for a whole subtree via
        the generated <code>provideXParams()</code>. Params shape <em>this render</em>.
        (<NuxtLink to="/examples/params">example</NuxtLink>)
      </li>
      <li>
        <b><code>useConditions</code></b> — between-subject assignment: which variant a
        participant gets. Assignment cycles across sessions so variants stay balanced, and
        conditions can be pinned from the dev UI for testing. Conditions typically feed
        into params. (<NuxtLink to="/examples/conditions">example</NuxtLink>)
      </li>
    </ul>
    <p>
      Project-wide settings (title, completion mode, extra nav pages) live in
      <code>epoch.config.ts</code>.
    </p>
  </DocsPage>
</template>
