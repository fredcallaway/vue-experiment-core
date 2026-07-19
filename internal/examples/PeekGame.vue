<script lang="ts">

// The task for the full-study example (/examples/study). On each round a coin is
// hidden in one of two boxes; before guessing (F/J) the participant may peek
// (SPACE), paying a point for a hint that is only *usually* honest. One epoch
// instance = one round — blocks are ERepeats over instances, configured by
// params and per-trial `rig`s.
//
// The component is "instructable": mounted `manual no-epoch` it does nothing on
// its own, and instruction pages script it through the exposed surface —
// playRound(rig) runs one (possibly rigged) round, allowGuess withholds F/J
// until a teaching moment has happened, and reactive `state` lets pages await
// and narrate what the participant does (via `until`). See
// PeekGameInstructions.vue.

export type PeekSide = 'left' | 'right'
const other = (side: PeekSide): PeekSide => side === 'left' ? 'right' : 'left'

// Fixes outcomes for demonstrations and balanced designs; unspecified fields
// stay random.
export type PeekRig = {
  target?: PeekSide
  hintValid?: boolean
}

export const [providePeekGameParams, usePeekGameParams] = defineParams({
  hintEnabled: true,
  hintValidity: 0.8, // chance the hint marks the coin's box
  hintCost: 1,
  winPoints: 2,
  feedbackMs: 1000,
  scored: true, // log rounds and move bonus points
})
export type PeekGameParams = ReturnType<typeof usePeekGameParams>

const [logRound, isRound] = declareEventLogger<{
  peeked: boolean
  hintValid: boolean | null
  guess: PeekSide
  target: PeekSide
  correct: boolean
  rt: number
}>('peekgame.round')

declareDataView('peekgame', (session: SessionData) =>
  session.events.filter(isRound).map(e => e.data)
)

</script>

<script lang="ts" setup>

const props = defineProps<{
  params?: Partial<PeekGameParams>
  // Rig for the automatic round (e.g. from a per-trial rig array).
  rig?: PeekRig
  // Don't run a round automatically; the host drives the game via playRound().
  manual?: boolean
}>()

const params = usePeekGameParams(props.params)

const epoch = useEpoch('peekgame')
const bonus = useBonus()
const { sleep, registerAsync } = useLocalAsync()

const state = reactive({
  active: false, // a round is in progress
  phase: 'choose' as 'choose' | 'feedback',
  target: 'left' as PeekSide,
  hint: null as PeekSide | null,
  peeked: false,
  guess: null as PeekSide | null,
  correct: false,
})

// Instructions set this false to ignore guesses until the participant has peeked.
const allowGuess = ref(true)

// One full round; resolves after feedback.
const playRound = async (rig?: PeekRig) => {
  state.active = true
  state.phase = 'choose'
  state.target = rig?.target ?? assertDefined(random.choice(['left', 'right'] as const))
  const hintValid = rig?.hintValid ?? random.float() < params.hintValidity
  state.hint = null
  state.peeked = false
  state.guess = null

  while (state.guess === null) {
    const { key, rt } = await registerAsync(promiseKeyPress('F J SPACE'))
    if (key === 'SPACE') {
      if (!params.hintEnabled || state.peeked) continue
      state.peeked = true
      state.hint = hintValid ? state.target : other(state.target)
      if (params.scored) bonus.addPoints(-params.hintCost)
    } else {
      if (!allowGuess.value) continue
      state.guess = key === 'F' ? 'left' : 'right'
      state.correct = state.guess === state.target
      if (params.scored) {
        logRound({
          peeked: state.peeked,
          hintValid: state.peeked ? hintValid : null,
          guess: state.guess,
          target: state.target,
          correct: state.correct,
          rt: Math.round(rt),
        })
        if (state.correct) bonus.addPoints(params.winPoints)
      }
    }
  }

  state.phase = 'feedback'
  await sleep(params.feedbackMs)
  state.active = false
}

onMounted(async () => {
  if (props.manual) return
  await playRound(props.rig)
  epoch.done()
})

defineExpose({ state, allowGuess, playRound })

</script>

<template>
  <div flex-col flex-center gap-4>
    <div flex gap-8>
      <div
        v-for="side in (['left', 'right'] as const)"
        :key="side"
        class="peek-box"
        :class="{ chosen: state.guess === side }"
      >
        <span v-if="state.phase === 'feedback' && state.target === side" text-4xl>🪙</span>
        <span v-else-if="state.phase === 'choose' && state.hint === side" text-3xl>⭐</span>
      </div>
    </div>

    <div text-sm text-gray-500 h-10 text-center>
      <template v-if="state.active && state.phase === 'choose'">
        <div><kbd>F</kbd> = left, <kbd>J</kbd> = right</div>
        <div v-if="params.hintEnabled && !state.peeked">
          <kbd>SPACE</kbd> = peek at a hint (−{{ params.hintCost }} point)
        </div>
      </template>
      <div v-else-if="state.phase === 'feedback'" :class="state.correct ? 'text-green' : 'text-red'">
        {{ state.correct ? `You found it! +${params.winPoints}` : 'Nothing there.' }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.peek-box {
  @apply w-24 h-24 rounded-lg b-2 b-gray-300 bg-gray-100 flex-center;
  transition: border-color 150ms ease, background-color 150ms ease;
}
.peek-box.chosen {
  @apply b-blue-500 bg-blue-50;
}
kbd {
  @apply px-1.5 py-0.5 rounded border border-gray-300 bg-gray-100 text-gray-700 text-xs font-mono;
}
</style>
