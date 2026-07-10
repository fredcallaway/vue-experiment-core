<script lang="ts">

// The data pipeline: declareEventLogger -> typed events -> declareDataView -> export
// rows. A trial usually logs several events (onset, response, ...); the data view
// groups them back into one row per trial with chunkBy, keyed on the event that
// starts each trial. Watch the Events and DataView panels in /dev while you respond.
//
// Log semantic task events explicitly — the automatic participant.* events from
// input primitives are for inspection, not your data record.

const [logOnset, isOnset] = declareEventLogger<{ trial: number; stimulus: string }>('trial.onset')
const [logChoice, isChoice] = declareEventLogger<{ correct: boolean; rt: number }>('trial.choice')

declareDataView('trial', (session: SessionData) => {
  const events = session.events.filter(e => isOnset(e) || isChoice(e))
  // chunkBy starts a new group at each onset; each group becomes one row.
  return chunkBy(events, isOnset).map((chunk) => {
    const onset = chunk.find(isOnset)?.data
    const choice = chunk.find(isChoice)?.data
    return {
      trial: onset?.trial,
      stimulus: onset?.stimulus,
      correct: choice?.correct ?? null,
      rt: choice ? Math.round(choice.rt) : null,
    }
  })
})

</script>

<script lang="ts" setup>

const stimuli = ['cat', 'dog', 'cat', 'dog']
const trial = ref(0)
let onsetAt = 0

const showTrial = () => {
  onsetAt = performance.now()
  logOnset({ trial: trial.value, stimulus: stimuli[trial.value] })
}
showTrial()

const respond = (said: string) => {
  logChoice({ correct: said === stimuli[trial.value], rt: performance.now() - onsetAt })
  trial.value++
  if (!done.value) showTrial()
}
const done = computed(() => trial.value >= stimuli.length)

</script>

<template>
  <EPage name="data" p4 flex-col gap-6>
    <p text-sm text-gray-600>
      Each trial logs <code>trial.onset</code> then <code>trial.choice</code>; the
      <code>trial</code> data view groups them into one row per trial. Watch the
      Events and DataView panels on the right.
    </p>

    <div flex-col flex-center gap-4 min-h-40>
      <template v-if="!done">
        <div text-sm text-gray-500>Trial {{ trial + 1 }} / {{ stimuli.length }}</div>
        <div text-3xl font-bold>{{ stimuli[trial] }}</div>
        <PButtons values="cat dog" @click="respond" />
      </template>
      <div v-else text-gray-500 italic>
        All trials done — select the <code>trial</code> view in the DataView panel.
      </div>
    </div>
  </EPage>
</template>
