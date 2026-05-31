<script lang="ts" setup>

const currentEpoch = useCurrentEpoch()

</script>

<template>
  <div w150 mx-auto>
    <div text-xl text-center mb-10 >{{ currentEpoch.id }}</div>
    <ERepeat name="DemoOutline" :count="4" v-slot="{ step }">
      <div mb-5>
        This page shows how the outline handles the case where the epoch structure
        is not constant within an ERepeat.
      </div>
      <div v-if="step == 2">
        <div>Oh my goodness, I didn't see this coming!</div>
        <ESequence name="surpriseSequence" >
          <EContinue button="much surprise" />
          <EContinue button="very unexpect " />
        </ESequence>
      </div>
      <div v-else>
        everything is going according to plan...
        <EContinue button />
      </div>
    </ERepeat>
  </div>
</template>
