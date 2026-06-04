<script lang="ts" setup>

// Phases let a *single* epoch show different content depending on its current
// "phase". Unlike ESequence (which mounts one child at a time), all phases live
// in one component, so they can share state and animate between each other.
// Reach for phases when a single logical step has several visual states — e.g. a
// trial that goes stimulus -> response -> feedback without remounting.
//
// usePhaseEpoch declares the epoch and its ordered list of phase names.
// useDisplayPhases gives you a <Phase> component plus goToPhase for transitions.
// Driving goToPhase from a watcher on epoch.phase keeps the display in sync with
// the epoch's phase, including when it changes programmatically (next/goTo).

const epoch = usePhaseEpoch('DemoPhases', ['apple', 'banana', 'choice', 'durian', 'date'])
const { Phase, goToPhase } = useDisplayPhases(epoch.phases, { duration: 500 })
watch(epoch.phase, async (newPhase) => {
  await goToPhase(newPhase)
})

</script>

<template>
  <div p4 flex-col gap-6>

    <div>
      <h2 text-xl font-bold>Phases</h2>
      <p mt-2>
        One epoch, several visual states. <code>&lt;Phase which="..."&gt;</code>
        blocks show and hide as the epoch's phase changes. Move between phases
        with <code>epoch.next</code>, <code>epoch.goTo(name)</code>, or finish
        with <code>epoch.done()</code>.
      </p>
      <p mt-1 text-sm text-gray-600>
        Current phase: <code>{{ epoch.phase }}</code>
      </p>
    </div>

    <div min-h-50>
      <!-- A Phase can match multiple phase names (space-separated). Modifiers:
           - constant: always mounted; just invisible when inactive (keeps state)
           - persist:  kept mounted between its first and last active phase
           - static:   stays in layout flow when inactive (default: takes no space) -->
      <Phase which="apple banana" constant static mb-20>
        the phase is either apple or banana
      </Phase>

      <!-- A phase can host any content, including a nested sequence. -->
      <Phase which="apple" flex-center flex-col gap-5>
        <div font-bold>apple</div>
        <ESequence name="applesequence" text-lg>
          <EContinue name="reddelicious" button>Red Delicious</EContinue>
          <EContinue name="grannysmith" button>Granny Smith</EContinue>
          <EContinue name="honeycrisp" button>Honeycrisp</EContinue>
        </ESequence>
      </Phase>

      <!-- epoch.next advances to the next phase in the declared order. -->
      <Phase which="banana" flex-center flex-col gap-5>
        <div font-bold>banana</div>
        <PButton value="next" @click="epoch.next" />
      </Phase>

      <!-- epoch.goTo jumps to a named phase — handy for branching. -->
      <Phase which="choice" flex-center flex-col gap-5>
        <div font-bold>choice</div>
        <PButtons values="durian date" @click="(value) => epoch.goTo(value as any)" />
      </Phase>

      <Phase which="durian" flex-center flex-col gap-5>
        you chose durian
        <PButton value="reset" @click="epoch.goTo(0)" />
      </Phase>

      <!-- epoch.done() finishes the phase epoch entirely (advancing whatever
           contains it). epoch.goTo(0) jumps back to the first phase. -->
      <Phase which="date" flex-center flex-col gap-5>
        you chose date
        <div flex-center gap-2 >
          <PButton value="reset" color="red" @click="epoch.goTo(0)" />
          <PButton value="move on" @click="epoch.done()" />
        </div>
      </Phase>
    </div>
  </div>
</template>
