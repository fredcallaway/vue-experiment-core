<script lang="ts">

// The miniature task shared by the interactive-instruction examples: on each round
// a coin is hidden on the left or right, the participant guesses with F/J, and the
// coin is revealed. Three integration points make it teachable from instructions:
//   - hooks: pause/observe the game at key moments (instructions-hooks example)
//   - params: run a short unscored practice block (instructions-embedded example)
//   - manual + playRound(): drive rounds imperatively (instructions-ref example)

export type CoinGameState = {
  round: number
  target: 'left' | 'right'
  guess: 'left' | 'right' | null
  correct: boolean
  showCoin: boolean
}

// The game awaits each emit; a pending receive() runs its callback (which may
// mutate the state, e.g. to rig an outcome) and suspends the game until the
// callback resolves.
export const hooks = {
  beforeGuess: defineHook<CoinGameState>(),
  afterGuess: defineHook<CoinGameState>(),
  afterFeedback: defineHook<CoinGameState>(),
}

export const [provideCoinGameParams, useCoinGameParams] = defineParams({
  rounds: 5,
  scored: true, // log rounds and award bonus points
  feedbackMs: 1200,
})
export type CoinGameParams = ReturnType<typeof useCoinGameParams>

const [logRound, isRound] = declareEventLogger<{
  round: number
  guess: string
  target: string
  correct: boolean
  rt: number
}>('coingame.round')

declareDataView('coingame', (session: SessionData) =>
  session.events.filter(isRound).map(e => e.data)
)

</script>

<script lang="ts" setup>

const props = defineProps<{
  params?: Partial<CoinGameParams>
  // Don't run rounds automatically; the host drives them via the exposed playRound().
  manual?: boolean
}>()

const params = useCoinGameParams(props.params)

const epoch = useEpoch('coingame')
const bonus = useBonus()
const { sleep, registerAsync } = useLocalAsync()

const state = reactive<CoinGameState>({
  round: 0,
  target: 'left',
  guess: null,
  correct: false,
  showCoin: false,
})

// One full round; resolves after feedback. Pass `target` to rig the outcome
// up front (an afterGuess receiver can also rig it after the guess).
const playRound = async (target?: CoinGameState['target']) => {
  state.target = target ?? assertDefined(random.choice(['left', 'right'] as const))
  state.guess = null
  state.showCoin = false
  await hooks.beforeGuess.emit(state)

  const { key, rt } = await registerAsync(promiseKeyPress('F J'))
  state.guess = key === 'F' ? 'left' : 'right'
  await hooks.afterGuess.emit(state)

  state.correct = state.guess === state.target
  state.showCoin = true
  if (params.scored) {
    logRound({
      round: state.round,
      guess: state.guess,
      target: state.target,
      correct: state.correct,
      rt: Math.round(rt),
    })
    if (state.correct) bonus.addPoints(1)
  }
  await sleep(params.feedbackMs)
  await hooks.afterFeedback.emit(state)
  state.showCoin = false
  state.round++
}

onMounted(async () => {
  if (props.manual) return
  while (state.round < params.rounds) {
    await playRound()
  }
  epoch.done()
})

defineExpose({ state, playRound })

</script>

<template>
  <div flex-col flex-center gap-4>
    <div v-if="params.scored" text-sm text-gray-500>
      Round {{ Math.min(state.round + 1, params.rounds) }} / {{ params.rounds }}
    </div>

    <div flex gap-8>
      <div
        v-for="side in (['left', 'right'] as const)"
        :key="side"
        class="coin-box"
        :class="{ chosen: state.guess === side }"
      >
        <span v-if="state.showCoin && state.target === side" text-4xl>🪙</span>
      </div>
    </div>

    <div text-sm text-gray-500 h-5>
      <span v-if="!state.guess"><kbd>F</kbd> = left, <kbd>J</kbd> = right</span>
      <span v-else-if="state.showCoin" :class="state.correct ? 'text-green' : 'text-red'">
        {{ state.correct ? 'You found it!' : 'Nothing there.' }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.coin-box {
  @apply w-24 h-24 rounded-lg b-2 b-gray-300 bg-gray-100 flex-center;
  transition: border-color 150ms ease, background-color 150ms ease;
}
.coin-box.chosen {
  @apply b-blue-500 bg-blue-50;
}
kbd {
  @apply px-1.5 py-0.5 rounded border border-gray-300 bg-gray-100 text-gray-700 text-xs font-mono;
}
</style>
