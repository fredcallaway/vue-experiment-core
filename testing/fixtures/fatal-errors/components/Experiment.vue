<script setup lang="ts">
const responses = ref(0)
</script>

<template>
  <ESequence name="fixture">
    <EPage name="trial">
      <h1>Fatal error fixture</h1>
      <p>Responses: {{ responses }}</p>
      <button @click="responses++">Respond</button>
    </EPage>
  </ESequence>
</template>
