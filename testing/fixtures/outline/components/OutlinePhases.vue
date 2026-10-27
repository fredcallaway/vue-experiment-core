<script setup lang="ts">
import { usePhaseEpoch } from '../../../../composables/useEpoch'
import { useDisplayPhases } from '../../../../composables/useDisplayPhases'

// Reduced from historical EDemoPhases (18ca2a4a), committed shortly after 6ed0258.
const epoch = usePhaseEpoch('phases', ['apple', 'banana', 'choice'])
const { Phase, goToPhase, animating, transitionStage } = useDisplayPhases(epoch.phases, { duration: 500 })
watch(epoch.phase, async phase => { await goToPhase(phase) })
const count = ref(0)
</script>

<template>
  <section>
    <p data-testid="phase-animation">{{ animating ? transitionStage : 'settled' }}</p>
    <p data-testid="phase-state">Phase count: {{ count }}</p>
    <PButton value="Increment phase" @click="count++" />
    <Phase which="apple banana" constant static><p>Apple or banana display</p></Phase>
    <Phase which="apple">
      <ESequence name="applePages">
        <EContinue name="red" button="Next apple">Red apple page</EContinue>
        <EContinue name="green" button="Finish apples">Green apple page</EContinue>
      </ESequence>
    </Phase>
    <Phase which="banana">
      <p>Banana phase</p>
      <PButton value="Choose phase" @click="epoch.next()" />
    </Phase>
    <Phase which="choice">
      <p>Choice phase</p>
      <PButton value="Finish phases" @click="epoch.done()" />
    </Phase>
  </section>
</template>
