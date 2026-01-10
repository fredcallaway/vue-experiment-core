<script lang="ts" setup>

defineWindowSize({
  width: 1000,
  height: 850,
})


const phases = ['apple', 'banana', 'choice', 'durian', 'date'] as const
const E = usePhases(phases, { transition: 'fade', transitionDuration: 1000})
const Phase = E.Phase

</script>

<template>
  <div flex-center flex-col text-3xl gap-10 relative>

    <Phase which="apple banana">
      the phase is currently either apple or banana
    </Phase>
    
    <Phase which="apple" flex-center flex-col gap-5>
      apple
      <PButton value="next" @click="E.nextPhase" />
    </Phase>

    <Phase which="banana" flex-center flex-col gap-5>
      <OnMounted :fn="() => logDebug('banana mounted')" />
      banana
      <PButton value="next" @click="E.nextPhase" />
    </Phase>

    <Phase which="choice" flex-center flex-col gap-5>
      choice
      <PButtons values="durian date" @click="(value) => E.goToPhase(value as any)" />
    </Phase>
    <Phase which="durian" flex-center flex-col gap-5>
      durian
      <PButton value="next" @click="E.nextPhase" />
    </Phase>
    <Phase which="date" flex-center flex-col gap-5>
      date
      <PButton value="next" @click="E.nextPhase" />
    </Phase>
  </div>
</template>
