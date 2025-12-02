<script lang="ts" setup>

const bonus = useBonus()


</script>

<template>
  <div>
    <h1>Test</h1>
    <div flex="~ col gap-2">
      <div>Bonus: {{ bonus.report }}</div>
      <button w-30 btn-gray @click="bonus.addPoints(100)">add 100</button>
    </div>
    <EpochView absolute right-5 top-0/>
    <EventView />
  </div>
</template>