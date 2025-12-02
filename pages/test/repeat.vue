<script lang="ts" setup>
const currentEpoch = useCurrentEpoch()
</script>

<template>
<div w600px mx-auto p4 mt-4 relative text-center>
  <div h-20>
    {{ currentEpoch.id }}
  </div>
  <ERepeat :count="3" v-slot="{ step: page, nSteps: nPages, epoch: topEpoch }">
    <p>Page {{ page + 1 }} of {{ nPages }}</p>
    <ESequence>
      <EPage name="page">
        starting page {{ page + 1 }}...
        <EDelay :ms="1000" />
      </EPage>
      <ERepeat :count="3" v-slot="{ step, nSteps }">
        <p>step {{ step + 1 }}</p>
        <PButton btn-red v-if="page == nPages-1 && step == nSteps-1" value="Reset" @click="topEpoch.goTo(0)" />
        <EContinue v-else button />
      </ERepeat>
    </ESequence>
  </ERepeat>
</div>
</template>