<script setup lang="ts">
import { usePhaseEpoch } from '../../../../composables/useEpoch'
import { useDisplayPhases } from '../../../../composables/useDisplayPhases'

// Reduced from graphnav2's ECorsiPlan/EDigitPlan: a memory epoch survives an intervening graph phase.
const epoch = usePhaseEpoch('persistent', ['presentation', 'graph', 'recall'])
const { Phase, goToPhase, animating } = useDisplayPhases(epoch.phases, { duration: 200 })
watch(epoch.phase, async phase => { await goToPhase(phase) })
</script>

<template>
  <section>
    <p data-testid="persistent-animation">{{ animating ? 'animating' : 'settled' }}</p>
    <Phase which="presentation recall" persist>
      <OutlineMemory @graph="epoch.goTo('graph')" />
    </Phase>
    <Phase which="graph">
      <EContinue name="graphPage" button="Recall memory">Graph interlude</EContinue>
    </Phase>
  </section>
</template>
