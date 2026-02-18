<script lang="ts" setup>
const currentEpoch = useCurrentEpoch()
const fast = useFastMode()

</script>

<template>
  <div bg-gray-100 p-2 rounded-lg flex="~ items-center gap-2" >
    <button @click="currentEpoch.done()">
      <div
        title="Next Epoch"
        i-mdi-arrow-right-bold-box
        text-2xl
        text-gray-400
        hover:text-gray-700
        active:translate-y-0.1
        active:scale-94
        transition-transform
        duration-75
      />
    </button>
    <button @click="fast = !fast">
      <div
        :title="fast ? 'Disable Fast Mode' : 'Enable Fast Mode'"
        i-mdi-speedometer
        text-2xl
        :class="[fast ? 'text-blue-500' : 'text-gray-300']"
      />
    </button>
  </div>
</template>
