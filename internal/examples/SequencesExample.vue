<script lang="ts" setup>

// Composing experiment structure from the three core epochs:
//   EContinue — one screen, advances on space/button
//   ESequence — runs its children in order
//   ERepeat   — runs one child template `count` times
// Concept tutorial: /docs. Every direct child of ESequence/ERepeat must be an
// epoch component (EContinue, EPage, or a custom component that calls useEpoch).

// Per-trial data lives in an array indexed by the repeat's `step`.
// Build (and shuffle) it up front; randomize the data, not the loop.
const trials = random.shuffle([
  { word: 'apple', color: 'red' },
  { word: 'sky', color: 'blue' },
  { word: 'leaf', color: 'green' },
])

</script>

<template>
  <div p4>
    <ESequence name="main">

      <EContinue name="welcome">
        A minimal experiment structure. Press space to begin.
      </EContinue>

      <!-- A child can itself be a sequence; it must finish before the outer one advances. -->
      <ESequence name="block" flex-center flex-col gap-4>
        <EContinue name="first" button="Next">First screen of a nested sequence</EContinue>
        <EContinue name="second" button="Next">Second screen of a nested sequence</EContinue>
      </ESequence>

      <!-- Each iteration is a fresh epoch instance with independent state. -->
      <ERepeat name="trials" :count="trials.length" v-slot="{ step, nSteps }" class="flex-col gap-4">
        <div text-sm text-gray-500 text-center>Trial {{ step + 1 }} / {{ nSteps }}</div>
        <EContinue name="stimulus">
          The word is <b :class="`text-${trials[step].color}`">{{ trials[step].word }}</b>
        </EContinue>
      </ERepeat>

      <!-- Terminal screen: an EPage with no continue affordance ends the example. -->
      <EPage name="end" text-center>
        Done. In a real experiment this is where <code>&lt;ECompletion /&gt;</code> goes
        (see the experiment example).
      </EPage>

    </ESequence>
  </div>
</template>
