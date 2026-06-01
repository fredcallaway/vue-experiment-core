<script lang="ts" setup>

// This page covers the two building blocks you'll use most: ESequence (show
// things one at a time) and ERepeat (run the same template many times).

const currentEpoch = useCurrentEpoch()

// In a real experiment, per-trial data lives in an array indexed by `step`. You
// typically build (and shuffle) this array yourself, then index it with `step`.
const trials = [
  { word: 'apple', color: 'red' },
  { word: 'sky', color: 'blue' },
  { word: 'leaf', color: 'green' },
]

defineWindowSize({
  width: 600,
  height: 800,
})

</script>

<template>
  <div p4>
    <ESequence>

      <EPage name="welcome">
        <h2>Welcome!</h2>
        If you're just starting to use the template, you've come to the right place.
        This tutorial introduces the two building blocks you'll use most:
        <code>ESequence</code> and <code>ERepeat</code>.
        <PContinue/>
      </EPage>

      <!-- ESequence is the workhorse for showing things one at a time. Each direct
           child is an *epoch* (EPage, ESequence, ERepeat, ...). The sequence shows
           the first child; when that child finishes (calls `done`), it advances to
           the next; when the last child finishes, the sequence itself finishes. -->
      <ESequence name="sequence">

        <EPage name="intro">
          <h2>ESequence</h2>
          <p mt-2>
            Renders its children one at a time, advancing when each child finishes.
            Children should be epochs; the sequence advances when the active child
            calls <code>done</code>, and finishes once its last child does.
          </p>
          <PContinue/>
        </EPage>

        <!-- Each child below is a separate epoch. The simplest leaf is an EPage
             with a PContinue, which finishes when the participant continues. -->
        <ESequence name="example" flex-center flex-col gap-5 min-h-40 b-1 b-gray-200 rounded p6>
          <EPage name="step1">
            <div font-bold>Step 1</div>
            This is the first child. Continue to advance.
            <PContinue/>
          </EPage>

          <EPage name="step2">
            <div font-bold>Step 2</div>
            The previous child finished, so the sequence moved on to this one.
            <PContinue/>
          </EPage>

          <!-- Note that this child is *not* an epoch, but just a plain div.
               This is fine because the div contains an epoch. Otherwise,
               a placeholder leaf epoch would start, and it would have no
               natural way to end.

               This pattern allows us to have some content that is stable while the
               inner "nested" ESequence steps through its children. -->
          <div>
            <h3 font-bold>Nesting</h3>
            <p mt-1 mb-3>
              A child of a sequence can itself be a sequence. The inner sequence must
              finish before the outer one advances. The current epoch is {{ currentEpoch.id }}.
            </p>
            <ESequence name="nested" flex-center flex-col gap-5 min-h-40 b-1 b-gray-200 rounded p6>
              <EPage name="step1"> Step 1 <PContinue/></EPage>
              <ESequence name="2" flex-center flex-col gap-3>
                <EPage name="A">Step 2A<PContinue/></EPage>
                <EPage name="B">Step 2B<PContinue/></EPage>
              </ESequence>
              <EPage name="step3">Step 3<PContinue/></EPage>
            </ESequence>
          </div>

          <!-- The last child: when it finishes the whole sequence is done. -->
          <EPage name="done">
            <div font-bold>Done</div>
            That was the last child, so the sequence has finished.
            <PContinue button="Continue"/>
          </EPage>
        </ESequence>
      </ESequence>

      <!-- ERepeat runs the same child template `count` times in a row. The slot
           receives `step` (the current iteration, 0-indexed), so each iteration can
           show different content while sharing one template. This is how you run
           trials. Each iteration is its own epoch instance, so iterations have
           independent state and are logged separately. -->
      <ESequence name="repeat">

        <EPage name="intro">
          <h2>ERepeat</h2>
          <p mt-2>
            Runs the same child template <code>count</code> times. The slot receives
            <code>step</code> (0-indexed), so the shared template can render
            per-iteration content — typically one trial of your experiment.
          </p>
          <PContinue/>
        </EPage>

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

        <EPage name="outro">
          <p>
            To randomize trial order, shuffle your data array before rendering (e.g.
            with <code>random.shuffle</code>) — <code>ERepeat</code> always runs
            iterations <code>0..count-1</code> in order, so the order lives in the data.
          </p>
          <PContinue button="Restart from the top"/>
        </EPage>
      </ESequence>

    </ESequence>
  </div>
</template>
