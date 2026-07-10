<script lang="ts" setup>

// Phases: one epoch, several visual states that share component state and can
// animate between each other. Reach for usePhaseEpoch when a single logical step
// (a trial) has internal stages — unlike an ESequence of siblings, phases don't
// remount, so no state hoisting is needed.
//
// usePhaseEpoch declares the epoch and phase order; useDisplayPhases renders the
// active <Phase>. The watch keeps the display in sync however the phase changes
// (next/goTo/jumps from the outline).

const epoch = usePhaseEpoch('demo', ['ready', 'guess', 'reveal'])
const { Phase, goToPhase } = useDisplayPhases(epoch.phases, { duration: 400 })
watch(epoch.phase, goToPhase)

// Phase-shared trial state: lives once in the component, visible to every phase.
const target = ref('')
const guess = ref('')

const start = () => {
  target.value = assertDefined(random.choice(['left', 'right']))
  epoch.next() // advance to the next declared phase
}

const choose = (side: string) => {
  guess.value = side
  epoch.goTo('reveal') // or jump to a named phase
}

</script>

<template>
  <div p4 flex-col gap-6>
    <div text-sm text-gray-600 text-center>
      Current phase: <code>{{ epoch.phase }}</code>
    </div>

    <div min-h-40 relative>
      <!-- `which` can list several phases. Modifiers:
           constant — always mounted, hidden when inactive (keeps internal state)
           persist  — mounted from its first to its last matching phase
           static   — keeps its place in layout flow when inactive -->
      <Phase which="ready guess" static text-center text-sm text-gray-500 mb-4>
        A coin is hidden on one side.
      </Phase>

      <Phase which="ready" flex-center>
        <PButton value="Start" @click="start" />
      </Phase>

      <Phase which="guess" flex-center flex-col gap-4>
        <div>Where is it?</div>
        <PButtons values="left right" @click="choose" />
      </Phase>

      <Phase which="reveal" flex-center flex-col gap-4>
        <div text-2xl>
          {{ guess === target ? '🎉 Found it!' : `It was ${target}.` }}
        </div>
        <div flex gap-2>
          <PButton value="again" color="gray" @click="epoch.goTo(0)" />
          <!-- done() finishes the whole phase epoch, advancing its parent. -->
          <PButton value="finish" @click="epoch.done()" />
        </div>
      </Phase>
    </div>
  </div>
</template>
