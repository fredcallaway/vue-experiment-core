<script setup lang="ts">
const props = defineProps<{ path: string }>()
const tool = computed(() => props.path.split('/')[1] === 'prolific' ? 'Prolific' : 'Data')
</script>

<template>
  <main class="p-8 max-w-3xl mx-auto">
    <h1>{{ tool }}</h1>
    <p class="mt-4">{{ tool }} isn't available on the hosted website.</p>
    <p class="mt-4">To use it, start the local server in your experiment folder:</p>
    <pre class="my-4"><code>bun run dev</code></pre>
    <p>Open the localhost address shown in the terminal, then choose <strong>{{ tool }}</strong>.</p>
  </main>
</template>
