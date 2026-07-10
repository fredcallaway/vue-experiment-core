<script lang="ts" setup>
import StroopTrial from './StroopTrial.vue'

// A block of custom trials: ERepeat provides the loop and per-trial epochs;
// StroopTrial.vue is the component to read for the trial anatomy itself
// (params, typed events, data view, phases, done()).

const words = ['red', 'blue'] as const
const trials = random.shuffle(
  words.flatMap(word => words.map(ink => ({ word, ink })))
)

</script>

<template>
  <div p4>
    <ESequence name="main">

      <EContinue name="instructions">
        Press <kbd>F</kbd> if the ink is red, <kbd>J</kbd> if it is blue.
        Ignore the word itself.
      </EContinue>

      <ERepeat name="trials" :count="trials.length" v-slot="{ step, nSteps }" class="flex-col gap-2">
        <!-- Content outside the trial epoch persists across the block. -->
        <div text-sm text-gray-500 text-center>Trial {{ step + 1 }} / {{ nSteps }}</div>
        <StroopTrial :word="trials[step].word" :ink="trials[step].ink" />
      </ERepeat>

      <EPage name="end" text-center>
        Done. Open the DataView panel in <NuxtLink to="/dev">/dev</NuxtLink> (view:
        <code>stroop</code>) to see the exported rows.
      </EPage>

    </ESequence>
  </div>
</template>
