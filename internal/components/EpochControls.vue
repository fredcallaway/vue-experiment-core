<script lang="ts" setup>
const currentEpoch = useCurrentEpoch()
const fast = useFastMode()

</script>

<template>
  <div bg-gray-100 p-2 rounded-lg flex="~ items-center gap-2" >
    <IconButton icon="i-mdi-arrow-right-bold-box" title="Next Epoch" @click="currentEpoch.done()" />
    <IconToggle v-model="fast" label="Fast Mode" icon="i-mdi-speedometer" />
  </div>
</template>

