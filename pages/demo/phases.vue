<script lang="ts" setup>

// Phases let a single epoch show different content depending on its current
// "phase". Drive the visible phase from the epoch and transition with
// useDisplayPhases.
const epoch = usePhaseEpoch('DemoPhases', ['apple', 'banana', 'choice', 'durian', 'date'])
const { Phase, goToPhase } = useDisplayPhases(epoch.phases, { duration: 500 })
watch(epoch.phase, async (newPhase) => {
  await goToPhase(newPhase)
})

</script>

<template>
  <div p10>
    <!-- constant means always mounted; just invisible when inactive -->
    <!-- see also: persist which keeps it mounted between first and last active phase -->
    <!-- static means it stays in the layout flow when not active (by default, it takes no space when inactive) -->
    <Phase which="apple banana" constant static mb-20>
      the phase is either apple or banana
    </Phase>

    <Phase which="apple" flex-center flex-col gap-5>
      <div font-bold>apple</div>
      <ESequence name="applesequence" text-lg>
        <EContinue button>Red Delicious</EContinue>
        <EContinue button>Granny Smith</EContinue>
        <EContinue button>Honeycrisp</EContinue>
      </ESequence>
    </Phase>

    <Phase which="banana" flex-center flex-col gap-5>
      <div font-bold>banana</div>
      <PButton value="next" @click="epoch.next" />
    </Phase>

    <Phase which="choice" flex-center flex-col gap-5>
      <div font-bold>choice</div>
      <PButtons values="durian date" @click="(value) => epoch.goTo(value as any)" />
    </Phase>

    <Phase which="durian" flex-center flex-col gap-5>
      you chose durian
      <PButton value="reset" @click="epoch.goTo(0)" />
    </Phase>

    <Phase which="date" flex-center flex-col gap-5>
      you chose date
      <div flex-center gap-2 >
        <PButton value="reset" color="red" @click="epoch.goTo(0)" />
        <PButton value="move on" @click="epoch.done()" />
      </div>
    </Phase>
  </div>
</template>
