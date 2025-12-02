<script lang="ts" setup>
// Minimal default experiment template
// Projects should override this component by creating components/Experiment.vue
logEvent('experiment.template.loaded')
</script>

<template>
  <div class="experiment-placeholder p-8 text-center">
    <h1 class="text-3xl mb-4">Epoch Framework Template</h1>
    <p class="text-lg mb-2">
      Override <code class="bg-gray-200 px-2 py-1 rounded">components/Experiment.vue</code> in your project to define your experiment.
    </p>
    <p class="text-sm text-gray-600">This is the default framework template.</p>
  </div>
</template>
