<script lang="ts" setup>

// ERepeat runs the same child template `count` times in a row. The slot receives
// `step` (the current iteration, 0-indexed), so each iteration can show
// different content while sharing one template. This is how you run trials.
//
// Each iteration is its own epoch instance, so iterations have independent state
// and are logged separately. ERepeat advances to the next iteration when its
// child finishes, and finishes itself after the last iteration.

// In a real experiment, per-trial data lives in an array indexed by `step`. You
// typically build (and shuffle) this array yourself, then index it with `step`.
const trials = [
  { word: 'apple', color: 'red' },
  { word: 'sky', color: 'blue' },
  { word: 'leaf', color: 'green' },
]

</script>

<template>
  <div w150 mx-auto p10 flex-col gap-6>

    <div>
      <h2 text-xl font-bold>ERepeat</h2>
      <p mt-2>
        Runs the same child template <code>count</code> times. The slot receives
        <code>step</code> (0-indexed), so the shared template can render
        per-iteration content — typically one trial of your experiment.
      </p>
    </div>

    <!-- The slot template is reused for every iteration; `step` selects this
         iteration's data. ERepeat advances when the child (here an ESequence)
         finishes, and finishes itself after the last iteration. -->
    <ERepeat name="trials" :count="trials.length" v-slot="{ step, nSteps }"
             class="flex-col gap-4 min-h-50 b-1 b-gray-200 rounded p6">
      <div text-sm text-gray-600>Trial {{ step + 1 }} / {{ nSteps }}</div>

      <!-- A trial is usually a small sequence: stimulus, response, feedback.
           Note `trials[step]` — the iteration index selects the trial data. -->
      <ESequence name="trial" flex-center flex-col gap-4>
        <EPage name="stimulus">
          The word is
          <span font-bold :class="`text-${trials[step].color}`">{{ trials[step].word }}</span>.
          <PContinue button="Respond"/>
        </EPage>
        <EPage name="feedback">
          You saw trial {{ step + 1 }}. On to the next.
          <PContinue button="Next trial"/>
        </EPage>
      </ESequence>
    </ERepeat>

    <p text-sm text-gray-600>
      To randomize trial order, shuffle your data array before rendering (e.g.
      with <code>random.shuffle</code>) — <code>ERepeat</code> always runs
      iterations <code>0..count-1</code> in order, so the order lives in the data.
    </p>

  </div>
</template>
