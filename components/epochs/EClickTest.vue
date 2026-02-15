<script lang="ts">

export const [provideClickTestParams, useClickTestParams, ProvideClickTestParams] = defineParams({
  durationMs: 20_000,
  delayMin: 200,
  delayMax: 200,
  pointsPerClick: 1,
  boardSize: 600,
  circleRadius: 20,
  minPadding: 12,
})
export type ClickTestParams = ReturnType<typeof useClickTestParams>

const [logClickTestParams, isClickTestParams] = declareEventLogger<ClickTestParams>('clicktest.params')
const [logClickTestHit, isClickTestHit] = declareEventLogger<{
  x: number
  y: number
}>('clicktest.hit')
const [logClickTestDone, isClickTestDone] = declareEventLogger<{ score: number }>('clicktest.done')

declareDataView('clicktest', (sessionData: SessionData) => {
  const events = sessionData.events.filter(e => isClickTestParams(e) || isClickTestHit(e) || isClickTestDone(e))
  const chunks = chunkBy(events, e => e.eventType === 'clicktest.params')
  return chunks.map(chunk => {
    const params = chunk.find(isClickTestParams)?.data
    const done = chunk.find(isClickTestDone)?.data
    return {
      score: done?.score ?? 0,
      clicks: done?.clicks ?? 0,
      durationMs: params?.durationMs ?? 0,
    }
  })
})

</script>

<script lang="ts" setup>

const props = defineProps<{ params?: Partial<ClickTestParams> }>()
const params = useClickTestParams(props.params)
logClickTestParams(params)
const { sleep } = useLocalAsync()
const bonus = useBonus()

assert(params.durationMs > 0, 'durationMs must be > 0')
assert(params.pointsPerClick >= 0, 'pointsPerClick must be >= 0')
assert(params.boardSize > 0, 'boardSize must be > 0')
assert(params.circleRadius > 0, 'circleRadius must be > 0')
assert(
  params.boardSize > (params.circleRadius + params.minPadding) * 2,
  'boardSize must be large enough to fit the circle with padding'
)

const phases = ['start', 'play', 'feedback','done'] as const
const E = usePhaseEpoch('clicktest', phases)
const { Phase, goToPhase } = useDisplayPhases(phases, { duration: 0 })
watch(E.phase, goToPhase)

const StartButton = usePButton({ value: 'start' })

const score = ref(0)
const clicks = ref(0)
const circleId = ref(0)
const circle = reactive({ x: 0, y: 0 })
const isPopping = ref(false)

const pad = computed(() => params.circleRadius + params.minPadding)
const circleSize = computed(() => params.circleRadius * 2)

const spawnCircle = () => {
  circle.x = random.int(pad.value, params.boardSize - pad.value)
  circle.y = random.int(pad.value, params.boardSize - pad.value)
  circleId.value++
}

const timer = useTimer(params.durationMs, { immediate: false })
timer.onDone(() => {
  if (E.phase.value === 'done' || E.phase.value === 'feedback') return
  E.goTo('feedback')
})

const delayDist = random.uniform(params.delayMin, params.delayMax)

watchImmediate(E.phase, async (currentPhase) => {
  const handlers = {
    start: async () => {
      await StartButton.promise('click')
      E.goTo('play')
    },
    play: async () => {
      score.value = 0
      clicks.value = 0
      isPopping.value = false
      timer.reset()
      sleep(delayDist()).then(spawnCircle)
      timer.resume()
    },
    feedback: async () => {
      timer.pause()
      logClickTestDone({
        score: score.value,
      })
    },
    done: async () => {
      logDebug('EClickTest.done')
      // await sleep(1500)
      E.done()
    },
  }
  await handlers[currentPhase]()
})

const onCircleClick = () => {
  if (E.phase.value !== 'play' || isPopping.value) return

  isPopping.value = true

  clicks.value++
  score.value += params.pointsPerClick
  bonus.addPoints(params.pointsPerClick)

  logClickTestHit({
    x: circle.x,
    y: circle.y,
  })

  sleep(delayDist()).then(() => {
    spawnCircle()
    isPopping.value = false
  })
}

</script>

<template>
  <div
    flex
    flex-col
    items-center
    gap-1
    :class="E.phase.value === 'done' && 'fade-out'"
  >
    <div flex justify-between text-xl fw-bold w-full>
      <div>Time: {{ timer.formattedTimeLeft }}</div>
      <div>Score: {{ score }}</div>
    </div>

    <div
      relative
      class="bg-white border-4 border-black"
      :style="{ width: `${params.boardSize}px`, height: `${params.boardSize}px` }"
    >

      <Phase which="start" class="overlay">
        <div class="absolute left-0 right-0 flex justify-center w-120 mx-auto" style="bottom: calc(50% + 40px);">
          <slot name="default" />
        </div>
        <StartButton />
      </Phase>

      <Phase which="play">
        <div
          v-if="circleId > 0"
          :key="circleId"
          class="click-circle"
          :class="isPopping && 'popping'"
          :style="{
            width: `${circleSize}px`,
            height: `${circleSize}px`,
            left: `${circle.x}px`,
            top: `${circle.y}px`,
          }"
          @click="onCircleClick"
        />
      </Phase>

      <Phase which="feedback" class="overlay">
        <div flex flex-col items-center gap-3>
          <div text-3xl fw-bold>Time's up!</div>
          <div text-2xl>Final score: {{ score }}</div>
          <PButton once value="Continue" @click="E.goTo('done')" />
        </div>
      </Phase>
    </div>
  </div>
</template>

<style scoped>
.fade-out {
  opacity: 0;
  transition: opacity 400ms ease;
}

.overlay {
  @apply absolute inset-0 flex items-center justify-center;
}

.click-circle {
  @apply absolute rounded-full cursor-pointer bg-blue-500;
  transform: translate(-50%, -50%) scale(1);
  animation: pop-in 90ms ease-out;
  transition: transform 140ms ease, opacity 140ms ease;
}

.click-circle.popping {
  transform: translate(-50%, -50%) scale(0.2);
  opacity: 0;
}

@keyframes pop-in {
  0% { transform: translate(-50%, -50%) scale(0.6); opacity: 0; }
  100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
}
</style>
