<script lang="ts">

// The "custom-epoch" tutorial. The other demos compose *built-in* epochs (EPage,
// ESequence, ERepeat); this one is itself a custom leaf epoch written from scratch —
// what you do whenever the built-ins aren't enough. It's a small memory game ("Simon"):
// the computer flashes a growing sequence of colored pads, and the participant repeats
// it back with the keyboard. The point is to show the *anatomy* of a custom epoch when
// it has real internal state and control flow. EClickTest is the same anatomy with a
// playfield, animation, and a countdown timer layered on.
//
// A custom epoch is a component that: (1) declares typed params with defineParams,
// (2) declares the epoch with useEpoch (here usePhaseEpoch, for show/recall/feedback
// phases), (3) logs typed events with declareEventLogger, and (4) ends itself with
// epoch.done(). Optionally it declares a data view that turns its events into export rows.
//
// The module-level <script> declares things that should exist once per *component*
// (not once per instance): the parameter set, the event logger, and the data view.
// The <script setup> below is the per-instance logic.

// The four pads, each bound to a key. Index in this array == the value we log.
const PADS = [
  { color: 'bg-red-500',    key: 'A' },
  { color: 'bg-blue-500',   key: 'S' },
  { color: 'bg-green-500',  key: 'D' },
  { color: 'bg-yellow-400', key: 'F' },
] as const

// 1. Parameters: typed, with defaults; overridable through the `params` prop.
export const [provideSimonParams, useSimonParams] = defineParams({
  startLength: 2,    // how many pads in the first round's sequence
  maxRounds: 8,      // round count at which we call it a win
  flashMs: 450,      // how long each pad lights up while the computer plays
  gapMs: 200,        // dark gap between flashes
})
export type SimonParams = ReturnType<typeof useSimonParams>

// 3. Events: one typed log per finished round. `isRound` is the matching type guard,
//    used by the data view (and by anyone filtering the event stream for these events).
export const [logRound, isRound] = declareEventLogger<{
  round: number
  length: number
  correct: boolean
  rt: number          // total time to enter the response (ms)
}>('simon.round')

// Data view: filter the session's events to ours and emit one row per round. Keep the
// transform next to the event shape it reads. This is what gets exported as a table.
declareDataView('simon', (session: SessionData) =>
  session.events.filter(isRound).map(e => e.data)
)

</script>

<script lang="ts" setup>

const props = defineProps<{ params?: Partial<SimonParams> }>()
const params = useSimonParams(props.params)
const { sleep } = useLocalAsync()

// 2. Declare the epoch BEFORE composables that depend on epoch context. We use a phase
//    epoch: one component, three visual states it moves between without remounting.
const phases = ['show', 'recall', 'feedback'] as const
const E = usePhaseEpoch('simon', phases)
const { Phase, goToPhase } = useDisplayPhases(phases, { duration: 0 })
watch(E.phase, goToPhase)

// --- Internal state -------------------------------------------------------------
const round = ref(1)
const sequence = ref<number[]>([])   // the target sequence of pad indices
const litPad = ref<number | null>(null)   // which pad is currently lit (computer's turn)
const inputPos = ref(0)              // how many pads the participant has correctly entered
const lastCorrect = ref(false)
let recallStart = 0

const targetLength = computed(() => params.startLength + round.value - 1)
const accepting = computed(() => E.phase.value === 'recall')

// Play the sequence back to the participant, one pad at a time.
const playSequence = async () => {
  for (const pad of sequence.value) {
    litPad.value = pad
    await sleep(params.flashMs)
    litPad.value = null
    await sleep(params.gapMs)
  }
}

// 3. Each pad press is logged generically by onKeyPress; here we just drive game logic.
const onPad = (pad: number) => {
  if (!accepting.value) return
  litPad.value = pad
  sleep(120).then(() => { if (litPad.value === pad) litPad.value = null })

  if (pad === sequence.value[inputPos.value]) {
    inputPos.value++
    if (inputPos.value === sequence.value.length) finishRound(true)
  } else {
    finishRound(false)
  }
}

const finishRound = (correct: boolean) => {
  lastCorrect.value = correct
  logRound({
    round: round.value,
    length: sequence.value.length,
    correct,
    rt: Math.round(performance.now() - recallStart),
  })
  E.goTo('feedback')
}

// Bind the four pad keys for the lifetime of the epoch; the handler gates on `accepting`.
PADS.forEach((pad, i) => onKeyPress(pad.key, () => onPad(i)))

// 4. The control flow lives in one watcher keyed on the current phase.
watchImmediate(E.phase, async (phase) => {
  if (phase === 'show') {
    // Extend the sequence by one and play the whole thing back.
    sequence.value = R.times(targetLength.value, () => random.int(0, PADS.length - 1))
    inputPos.value = 0
    await playSequence()
    recallStart = performance.now()
    E.goTo('recall')
  }
})

const nextRound = () => {
  if (!lastCorrect.value) { round.value = 1; E.goTo('show') }    // miss: restart from round 1
  else if (round.value >= params.maxRounds) E.done()             // cleared the game
  else { round.value++; E.goTo('show') }
}

</script>

<template>
  <div p4 flex-col gap-6>

    <!-- ========================= INTRO ========================= -->
    <h2 text-xl font-bold>Custom Epochs</h2>
    <p text-gray-600>
      A custom leaf epoch with real internal state and control flow. Watch the
      sequence, then repeat it with the keys <code>A S D F</code>. It grows by one
      each round. Open <code>CustomEpochDemo.vue</code> to follow along.
    </p>

    <!-- ========================= THE GAME ========================= -->
    <div flex-col flex-center gap-5 min-h-60>

      <div text-lg font-bold>
        <span v-if="E.phase.value === 'show'">Watch…</span>
        <span v-else-if="E.phase.value === 'recall'">Your turn — repeat the sequence</span>
        <span v-else>{{ lastCorrect ? 'Correct!' : 'Wrong — back to round 1' }}</span>
      </div>

      <div text-sm text-gray-500>Round {{ round }} / {{ params.maxRounds }}</div>

      <!-- The four pads. A pad lights up while the computer plays it, briefly when
           pressed, and is dimmed whenever input is not being accepted. -->
      <div flex gap-3>
        <button
          v-for="(pad, i) in PADS"
          :key="i"
          class="pad"
          :class="[pad.color, { lit: litPad === i, idle: !accepting }]"
          @click="onPad(i)"
        >
          {{ pad.key }}
        </button>
      </div>

      <!-- Recall progress: filled dots for pads entered so far. -->
      <div v-if="E.phase.value === 'recall'" flex gap-2 h-3>
        <div
          v-for="n in sequence.length"
          :key="n"
          class="dot"
          :class="{ done: n <= inputPos }"
        />
      </div>

      <Phase which="feedback" flex-center>
        <PButton
          once
          :value="!lastCorrect ? 'Try again' : round >= params.maxRounds ? 'Finish' : 'Next round'"
          @click="nextRound"
        />
      </Phase>
    </div>

  </div>
</template>

<style scoped>
.pad {
  @apply w-20 h-20 rounded-xl text-white text-2xl font-bold flex items-center justify-center cursor-pointer select-none;
  opacity: 0.45;
  transition: opacity 120ms ease, transform 120ms ease;
}
.pad.lit {
  opacity: 1;
  transform: scale(1.08);
}
/* Pads are clickable during recall; during show/feedback they only display. */
.pad.idle {
  cursor: default;
}
.dot {
  @apply w-3 h-3 rounded-full bg-gray-300;
}
.dot.done {
  @apply bg-gray-700;
}
</style>
