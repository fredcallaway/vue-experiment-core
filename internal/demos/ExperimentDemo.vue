<script lang="ts" setup>
import ColorTrial from './ColorTrial.vue'

// A full (short) experiment, assembled from epochs. Where the other demos drill into
// one feature, this one shows the shape of a real study end to end: consent ->
// instructions -> a block of trials -> a debrief survey -> completion. It is
// essentially a miniature version of components/Experiment.vue.
//
// It also shows the standard division of labor: epochs handle the high-level
// *structure* (the sequence of sections, the repeated block), while the trial — the
// part with real internal logic — is a custom *component* (ColorTrial.vue) with
// ordinary Vue-native state. Anything more involved than "show this, then continue"
// belongs in a component, not inline in the epoch tree.
//
// Script-side state is kept minimal:
//   - `trials` is the per-trial data (built and shuffled once, indexed by `step`)
//   - `bonus` is the running bonus, which the block reads and the trial increments
// Simple per-screen interaction (the instructions practice click) lives in EPage
// `state`, a per-page scratchpad that resets automatically.

const bonus = useBonus()
bonus.centsPerPoint = 5

// Each trial asks the participant to click a target color.
const colors = ['red', 'blue', 'green']
const trials = random.shuffle(repeat(colors, 2)).map(target => ({ target }))

</script>

<template>
  <div p4>

    <!-- The whole experiment is one ESequence: each child runs to completion, then
         hands control to the next. This is the same structure you'd put in
         components/Experiment.vue. -->
    <ESequence name="experiment">

      <!-- ========================= CONSENT ========================= -->

      <!-- EConsent renders the consent form (its slot) and finishes when the
           participant agrees. In a real study you'd pass your <ConsentContent/>;
           here a short inline form keeps the demo self-contained. -->
      <EConsent>
        <h2>Consent to participate</h2>
        <p>
          This is a demonstration experiment. No data is collected and there are no
          risks. You may stop at any time.
        </p>
        <p>By clicking "I agree" you confirm you are happy to continue.</p>
      </EConsent>

      <!-- ========================= INSTRUCTIONS ========================= -->

      <!-- ENavigableSequence gives the participant Back/Next controls (and arrow
           keys) to page through instructions. enableNext gates the Next button
           until the page's interaction is done, so they can't skip past a
           demonstration without trying it. -->
      <ENavigableSequence v-slot="{ enableNext }" header="Instructions">

        <EPage name="welcome" @mounted="enableNext">
          <p class="prompt">
            Thanks for taking part! This short task has a few trials. Use the arrow
            keys or the buttons above to move through these instructions.
          </p>
        </EPage>

        <!-- A page that requires an action gates Next until that action happens.
             Here the participant must make one practice click. -->
        <EPage name="practice" v-slot="{ state }" flex-center flex-col gap-4>
          <p class="prompt">
            On each trial you'll click a colored button. Try it now — click any
            button to continue.
          </p>
          <PButtons
            :values="colors"
            :classes="colors.map(c => `btn-${c}`)"
            :disabled="R.isDefined(state.clicked)"
            class="gap-4"
            @click="(v) => { state.clicked = v; enableNext() }"
          />
          <p v-if="state.clicked" text-sm text-gray-600>You clicked {{ state.clicked }}.</p>
        </EPage>

        <EPage name="ready" @mounted="enableNext">
          <p class="prompt">
            On each trial we'll name a color — click the matching button as quickly
            as you can. You earn a bonus for every correct click. Ready?
          </p>
        </EPage>
      </ENavigableSequence>

      <!-- ========================= TRIALS ========================= -->

      <!-- ERepeat runs the trial once per entry in `trials`. The persistent header
           (bonus + counter) lives here, in the branch epoch, so it stays on screen
           across every trial. `step` indexes into `trials`. -->
      <ERepeat name="trials" :count="trials.length" v-slot="{ step, nSteps }">

        <div flex justify-between text-lg font-bold mb-4>
          <div>Bonus: ${{ bonus.dollars.toFixed(2) }}</div>
          <div>Trial {{ step + 1 }} / {{ nSteps }}</div>
        </div>

        <!-- The trial itself is a custom component (a leaf epoch). It owns its own
             phases (choice -> feedback) and state; the block just hands it this
             trial's target and reacts when the answer is correct. -->
        <ColorTrial
          :target="trials[step].target"
          :colors="colors"
          @correct="bonus.addPoints(1)"
        />
      </ERepeat>

      <!-- ========================= DEBRIEF SURVEY ========================= -->

      <!-- ESurveyWrapper sequences survey epochs, each of which logs a
           survey.response event. See the surveys demo for the data view that turns
           those events into export rows. -->
      <ESurveyWrapper name="debrief">
        <ESurveyButtons
          name="enjoy"
          prompt="How much did you enjoy the task?"
          options="not at all | a little | a lot"
          required
        />
        <ESurveyText
          name="comments"
          prompt="Any comments for the researchers? (optional)"
          placeholder="Type here…"
        />
      </ESurveyWrapper>

      <!-- ========================= COMPLETION ========================= -->

      <!-- ECompletion is the terminal screen. In a real (live) study it saves data
           and redirects to Prolific; in this demo no session is initialized, so it
           shows its dev-mode panel with the collected events instead. -->
      <ECompletion />

    </ESequence>
  </div>
</template>
