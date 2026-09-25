<script lang="ts">
import { declareDataView } from '../../composables/dataViews'
import { defineParams } from '../../composables/defineParams'
import { declareEventLogger } from '../../composables/logEvent'
import { useDisplayPhases } from '../../composables/useDisplayPhases'
import { usePhaseEpoch } from '../../composables/useEpoch'
import { useLocalAsync } from '../../composables/useLocalAsync'
import { promiseKeyPress } from '../../utils/keyPress'
import { type SessionData } from '../data'


// The canonical custom trial component. This is the anatomy to copy for any trial
// with real internal logic: module-level params + event logger + data view, then
// per-instance epoch, phases, and control flow in <script setup>.

export const [provideStroopParams, useStroopParams] = defineParams({
  fixationMs: 500,
  feedbackMs: 800,
})
export type StroopParams = ReturnType<typeof useStroopParams>

const INKS = { F: 'red', J: 'blue' } as const
type Ink = (typeof INKS)[keyof typeof INKS]
const inkClasses: Record<Ink, string> = { red: 'text-red', blue: 'text-blue' }

// One typed event per response; `isResponse` is the guard used to filter the
// event stream in the data view.
const [logResponse, isResponse] = declareEventLogger<{
  word: Ink
  ink: Ink
  congruent: boolean
  key: string
  correct: boolean
  rt: number
}>('stroop.response')

declareDataView('stroop', (session: SessionData) =>
  session.events.filter(isResponse).map(e => e.data)
)

</script>

<script lang="ts" setup>

const props = defineProps<{
  word: Ink
  ink: Ink
  params?: Partial<StroopParams>
}>()

const params = useStroopParams(props.params)

// Declare the epoch before composables that depend on epoch context.
const epoch = usePhaseEpoch('stroop', ['fixation', 'stimulus', 'feedback'])
const { Phase, goToPhase } = useDisplayPhases(epoch.phases)
watch(epoch.phase, goToPhase)

const { sleep } = useLocalAsync()
const correct = ref(false)

// The whole trial is one async flow: fixation -> stimulus -> await response ->
// feedback -> done. sleep() comes from useLocalAsync so it cannot fire after unmount.
onMounted(async () => {
  await sleep(params.fixationMs)
  epoch.goTo('stimulus')
  const { key, rt } = await promiseKeyPress('F J')
  correct.value = INKS[key as keyof typeof INKS] === props.ink
  logResponse({
    word: props.word,
    ink: props.ink,
    congruent: props.word === props.ink,
    key,
    correct: correct.value,
    rt: Math.round(rt),
  })
  epoch.goTo('feedback')
  await sleep(params.feedbackMs)
  epoch.done() // ends the trial; control returns to the parent (usually an ERepeat)
})

</script>

<template>
  <div class="flex flex-wrap justify-center items-center flex-col gap-6 min-h-40">
    <Phase class="text-4xl" which="fixation">+</Phase>

    <Phase class="flex flex-wrap justify-center items-center flex-col gap-6" which="stimulus">
      <div class="text-5xl font-bold" :class="inkClasses[ink]">{{ word.toUpperCase() }}</div>
      <div class="text-sm text-gray-500">
        Ink color: <kbd>F</kbd> = red, <kbd>J</kbd> = blue
      </div>
    </Phase>

    <Phase class="text-3xl" which="feedback">
      <div class="text-green" v-if="correct">correct!</div>
      <div class="text-red" v-else>incorrect</div>
    </Phase>
  </div>
</template>
