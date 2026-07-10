<script lang="ts" setup>
import ColorTrial from './ColorTrial.vue'

// The shape of a full study, end to end — a miniature components/Experiment.vue:
// consent -> instructions -> no-return -> trials -> survey -> completion.
// Epochs give the structure; the trial with real logic is its own component.

const bonus = useBonus()
bonus.centsPerPoint = 5

const colors = ['red', 'blue', 'green']
const trials = random.shuffle(repeat(colors, 2)).map(target => ({ target }))

</script>

<template>
  <div p4>
    <ESequence name="experiment">

      <!-- EConsent finishes when the participant agrees. Real projects pass a
           <ConsentContent /> component defined at the project root. -->
      <EConsent>
        <h2>Consent to participate</h2>
        <p>This is a demonstration experiment. No data is collected and there are no risks.</p>
        <p>By clicking "I agree" you confirm you are happy to continue.</p>
      </EConsent>

      <ENavigableSequence v-slot="{ enableNext }" header="Instructions">
        <EPage name="welcome" @mounted="enableNext">
          <p class="prompt">
            Thanks for taking part! Use the arrow keys or the buttons above to move
            through these instructions.
          </p>
        </EPage>

        <!-- Gate Next on an action: only call enableNext once it's done. -->
        <EPage name="practice" v-slot="{ state }" flex-center flex-col gap-4>
          <p class="prompt">
            On each trial you'll click a colored button. Try it now.
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
            On each trial we'll name a color — click the matching button. You earn a
            bonus for every correct click. Ready?
          </p>
        </EPage>
      </ENavigableSequence>

      <!-- After this point the participant cannot restart the study. Place it
           after instructions, before the first real data is collected. -->
      <ENoReturn my10 />

      <ERepeat name="trials" :count="trials.length" v-slot="{ step, nSteps }">
        <!-- The persistent header lives in the branch epoch, outside the trial. -->
        <div flex justify-between text-lg font-bold mb-4>
          <div>Bonus: ${{ bonus.dollars.toFixed(2) }}</div>
          <div>Trial {{ step + 1 }} / {{ nSteps }}</div>
        </div>
        <ColorTrial
          :target="trials[step].target"
          :colors="colors"
          @correct="bonus.addPoints(1)"
        />
      </ERepeat>

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

      <!-- Terminal screen: saves data and redirects to Prolific in a live study;
           in dev it shows a panel with the collected events. -->
      <ECompletion />

    </ESequence>
  </div>
</template>
