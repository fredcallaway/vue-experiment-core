<script setup lang="ts">
import { useEpoch } from '../../../../composables/useEpoch'

const epoch = useEpoch('memory')
const emit = defineEmits<{ graph: [] }>()
const count = ref(0)
const mount = Math.random().toString(36)
</script>

<template>
  <section>
    <p data-testid="memory-state">Memory count: {{ count }}; mount: {{ mount }}</p>
    <PButton value="Increment memory" @click="count++" />
    <PButton value="Show graph" @click="emit('graph')" />
    <PButton value="Finish memory" @click="epoch.done()" />
  </section>
</template>
