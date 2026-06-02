<script lang="ts">

// The "data" tutorial. The simplified branch removed automatic participant.* logging
// in favor of explicit, semantic logs, so understanding the data pipeline is now
// essential. This demo makes the whole pipeline visible at once:
//
//   declareEventLogger  ->  typed events in the log  ->  declareDataView  ->  export rows
//
// The key idea the custom-epoch demo didn't cover: a single trial usually logs
// *several* events (onset, response, ...), and the data view groups them back into one
// row per trial with chunkBy, keyed off the event that starts each trial.

// Two typed loggers, with their matching `isX` type guards. The guards are what you
// filter the event stream with — both to select your events and to mark trial bounds.
const [logOnset, isOnset] = declareEventLogger<{ trial: number; stimulus: string }>('trial.onset')
const [logResponse, isResponse] = declareEventLogger<{ correct: boolean; rt: number }>('trial.response')

// A data view that produces one row per trial. The pattern:
//   1. filter the session's events down to the ones this view cares about,
//   2. chunkBy(isOnset) to split the flat list into per-trial groups (a new chunk
//      starts at each onset), then
//   3. reduce each chunk to a single row.
declareDataView('trial', (session: SessionData) => {
  const events = session.events.filter(e => isOnset(e) || isResponse(e))
  return chunkBy(events, isOnset).map((chunk) => {
    const onset = chunk.find(isOnset)?.data
    const response = chunk.find(isResponse)?.data
    return {
      trial: onset?.trial,
      stimulus: onset?.stimulus,
      correct: response?.correct ?? null,
      rt: response ? Math.round(response.rt) : null,
    }
  })
})

</script>

<script lang="ts" setup>

// A tiny task that logs the two events per trial. Each "trial" shows a stimulus
// (logging an onset) and takes a yes/no response (logging a response).
const stimuli = ['cat', 'dog', 'cat', 'dog']
const trial = ref(0)
const onsetAt = ref(0)

const showTrial = () => {
  if (trial.value >= stimuli.length) return
  onsetAt.value = performance.now()
  logOnset({ trial: trial.value, stimulus: stimuli[trial.value] })
}
showTrial()

const respond = (said: 'cat' | 'dog') => {
  if (trial.value >= stimuli.length) return
  logResponse({ correct: said === stimuli[trial.value], rt: performance.now() - onsetAt.value })
  trial.value++
  showTrial()
}
const done = computed(() => trial.value >= stimuli.length)

// Live views of both ends of the pipeline: the raw event log and the data view.
const rawEvents = reactive<LogEvent[]>([])
useLogEventBus().on((e) => { if (isOnset(e) || isResponse(e)) rawEvents.push(e) })

type TrialRow = { trial?: number; stimulus?: string; correct: boolean | null; rt: number | null }
const trialView = useDataViews().trial
const rows = computed(() =>
  trialView.fn({ meta: {} as any, events: [...rawEvents] }) as TrialRow[]
)

</script>

<template>
  <div w200 mx-auto p10 flex-col gap-6>

    <div>
      <h2 text-xl font-bold>Events, data views, and exports</h2>
      <p mt-2>
        Logged <b>events</b> are your raw record; a <b>data view</b> transforms them
        into export rows. Each trial below logs an <code>onset</code> and a
        <code>response</code> event; the data view groups them back into one row per
        trial. Run a few trials and watch both sides fill in.
      </p>
    </div>

    <!-- The task -->
    <div b-1 b-gray-200 rounded p6 flex-col flex-center gap-4 min-h-40>
      <template v-if="!done">
        <div text-sm text-gray-500>Trial {{ trial + 1 }} / {{ stimuli.length }}</div>
        <div text-3xl font-bold>{{ stimuli[trial] }}</div>
        <div text-sm text-gray-600>Which word is it?</div>
        <PButtons values="cat dog" @click="(v) => respond(v as 'cat' | 'dog')" />
      </template>
      <div v-else text-gray-500 italic>All trials done — see the rows below.</div>
    </div>

    <!-- Both ends of the pipeline, side by side. -->
    <div flex gap-6>
      <!-- Raw event log: the unprocessed record, one entry per logEvent call. -->
      <div flex-1>
        <h3 font-bold mb-2>Raw events</h3>
        <p text-sm text-gray-600 mb-2>One entry per <code>logOnset</code>/<code>logResponse</code> call.</p>
        <div v-if="rawEvents.length" text-xs font-mono b-1 b-gray-200 rounded p3 flex-col gap-1 max-h-60 overflow-y-auto>
          <div v-for="(e, i) in rawEvents" :key="i">
            <span text-purple>{{ e.eventType }}</span> {{ JSON.stringify(e.data) }}
          </div>
        </div>
        <div v-else text-sm text-gray-400 italic>No events yet.</div>
      </div>

      <!-- Data view: grouped into one row per trial. This is the export shape. -->
      <div flex-1>
        <h3 font-bold mb-2>Data view (<code>trial</code>)</h3>
        <p text-sm text-gray-600 mb-2>One row per trial, via <code>chunkBy(isOnset)</code>.</p>
        <table v-if="rows.length" text-sm b-1 b-gray-200 rounded w-full>
          <thead bg-gray-50>
            <tr><th p2 text-left>trial</th><th p2 text-left>stimulus</th><th p2 text-left>correct</th><th p2 text-left>rt</th></tr>
          </thead>
          <tbody>
            <tr v-for="(row, i) in rows" :key="i" b-t b-gray-100>
              <td p2>{{ row.trial }}</td>
              <td p2>{{ row.stimulus }}</td>
              <td p2>{{ row.correct === null ? '—' : String(row.correct) }}</td>
              <td p2>{{ row.rt ?? '—' }}</td>
            </tr>
          </tbody>
        </table>
        <div v-else text-sm text-gray-400 italic>No rows yet.</div>
      </div>
    </div>
  </div>
</template>
