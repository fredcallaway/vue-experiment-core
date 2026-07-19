<script lang="ts" setup>
import PeekGame, { providePeekGameParams, type PeekRig } from './PeekGame.vue'
import PeekGameInstructions from './PeekGameInstructions.vue'

// The complete study pattern, end to end — a miniature components/Experiment.vue
// with interactive instructions and real block structure:
//   consent → instructions (PeekGameInstructions.vue) → no-return →
//   2 blocks × 4 trials with a persistent header → survey → bonus reveal →
//   completion.
// Structure rules on display:
//   - conditions are assigned once, up top, and flow into params for the whole
//     study via providePeekGameParams
//   - blocks and trials are data, built (and shuffled) up front; ERepeat only
//     indexes them
//   - the bonus/progress header is presentational markup inside the blocks
//     epoch, so it stays mounted across the block

const bonus = useBonus()
bonus.centsPerPoint = 5

// Between-subject condition, feeding params for every PeekGame below.
const { hintValidity } = useConditions().choice({ hintValidity: [0.7, 0.9] })
providePeekGameParams({ hintValidity })

// Each hint-block guarantees one lying hint; everything else stays random.
const nTrials = 4
const blocks = [
  { hintEnabled: false, rigs: [{}, {}, {}, {}] as PeekRig[] },
  { hintEnabled: true, rigs: random.shuffle([{ hintValid: false }, {}, {}, {}] as PeekRig[]) },
]

</script>

<template>
  <div p4>
    <ESequence name="experiment">

      <!-- Real projects pass a <ConsentContent /> component defined at the
           project root. -->
      <EConsent>
        <h2>Consent to participate</h2>
        <p>This is a demonstration experiment. No data is collected and there are no risks.</p>
        <p>By clicking "I agree" you confirm you are happy to continue.</p>
      </EConsent>

      <PeekGameInstructions />

      <!-- After this point the participant cannot restart the study. Place it
           after instructions, before the first real data is collected. -->
      <ENoReturn my10 />

      <ERepeat name="blocks" :count="blocks.length" v-slot="{ step: block }">
        <div flex justify-between text-lg font-bold mb-6 w-120 mx-auto>
          <div>Bonus: {{ bonus.dollarsString }}</div>
          <div>Block {{ block + 1 }} / {{ blocks.length }}</div>
        </div>

        <ESequence name="block" text-center>
          <EContinue name="blockIntro" prompt>
            <template v-if="blocks[block].hintEnabled">
              In this block you can peek (<kbd>SPACE</kbd>) before guessing.
            </template>
            <template v-else>
              In this block there are no hints — trust your gut.
            </template>
          </EContinue>

          <ERepeat name="trials" :count="nTrials" v-slot="{ step, nSteps }" class="flex-col gap-2">
            <div text-sm text-gray-500 text-center>Trial {{ step + 1 }} / {{ nSteps }}</div>
            <PeekGame
              :params="{ hintEnabled: blocks[block].hintEnabled }"
              :rig="blocks[block].rigs[step]"
            />
          </ERepeat>
        </ESequence>
      </ERepeat>

      <ESurveyWrapper name="debrief">
        <ESurveyButtons
          name="hintUse"
          prompt="When a hint was shown, how often did you follow it?"
          options="never | sometimes | always"
          required
        />
        <ESurveyText
          name="comments"
          prompt="Any comments for the researchers? (optional)"
          placeholder="Type here…"
        />
      </ESurveyWrapper>

      <EContinue name="reveal" button="Finish" prompt>
        You earned {{ bonus.pointsString }}, for a bonus of <b>{{ bonus.dollarsString }}</b>.
      </EContinue>

      <!-- Terminal screen: saves data and redirects to Prolific in a live study;
           in dev it shows a panel with the collected events. -->
      <ECompletion />

    </ESequence>
  </div>
</template>
