<script lang="ts" setup>

defineWindowSize({
  width: 600,
  height: 500,
})
await nextTick()

const phases = ['apple', 'banana', 'choice', 'durian', 'date'] as const
const E = usePhaseEpoch('phases2', phases)


const { Phase, goToPhase, phase } = useDisplayPhases(phases, { duration: 200 })

watch(E.phase, (newPhase, oldPhase) => {
  goToPhase(newPhase)
})

await nextTick()

</script>

<template>
  <div flex-center flex-col text-2xl gap-10 relative>
    <PKey keys="T" />

    <Phase which="apple banana">
      the phase is currently either apple or banana
    </Phase>
    
    <Phase which="apple" flex-center flex-col gap-5>
      apple
      <ESequence name="applesequence" text-lg>
        <EContinue button>Red Delicious</EContinue>
        <EContinue button>Granny Smith</EContinue>
        <EContinue button>Honeycrisp</EContinue>
        <EButtons values="next" />
      </ESequence>
    </Phase>


    <Phase which="banana" flex-center flex-col gap-5>
      banana
      <PButton value="next" @click="E.next" />
    </Phase>

    <Phase which="choice" flex-center flex-col gap-5>
      choice
      <PButtons values="durian date" @click="(value) => E.goTo(value as any)" />
    </Phase>

    <Phase which="durian" flex-center flex-col gap-5>
      durian
      <PButton value="next" @click="E.next" />
    </Phase>

    <Phase which="date" flex-center flex-col gap-5>
      date
      <PButton value="reset" @click="E.goTo(0)" />
    </Phase>
  </div>
</template>
