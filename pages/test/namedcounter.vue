<script lang="ts" setup>

const count1 = useNamedCounter('test-counter-1')
const count2 = useNamedCounter('test-counter-2')
const count3 = useNamedCounter('test-counter-1')
</script>

<template>
  <div w-100 h-100 py-10>
    <button @click="count1.inc">Increment count1</button>
    <button @click="count2.inc">Increment count2</button>
    <button @click="count3.inc">Increment count3</button>
    <p>count1: {{ count1.value }}</p>
    <p>count2: {{ count2.value }}</p>
    <p>count3: {{ count3.value }}</p>
  </div>
</template>