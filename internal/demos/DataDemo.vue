<script lang="ts">

// The "data" tutorial. The simplified branch removed automatic participant.* logging
// in favor of explicit, semantic logs, so understanding the data pipeline is now
// essential. A few intro EPages walk through the pipeline conceptually (where data
// goes, logEvent, declareEventLogger), then the final "example" page makes the whole
// thing visible at once:
//
//   declareEventLogger  ->  typed events in the log  ->  declareDataView  ->  export rows
//
// The key idea the custom-epoch demo didn't cover: a single trial usually logs
// *several* events (onset, response, ...), and the data view groups them back into one
// row per trial with chunkBy, keyed off the event that starts each trial.
//
// The intro pages tell the reader to watch the EventView panel on the right rather than
// building a custom event log — that panel already shows the live stream.

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
  <ESequence name="data">

    <!-- ========================= INTRO ========================= -->

    <EPage name="intro">
      <h2>Recording data</h2>
      <p>
        Everything a participant does is recorded as a stream of <b>events</b>. This
        tutorial covers how events get written, how they reach permanent storage, and
        how you turn the raw stream into tidy export rows.
      </p>
      <p>
        As you read, watch the <b>EventView</b> panel on the right: it shows the live
        event log for this session. Every event you log shows up there, so it's the
        first place to look when checking that your task is recording what you expect.
      </p>
      <PContinue/>
    </EPage>

    <!-- ========================= DATA WRITER ========================= -->

    <EPage name="writer">
      <h2>Where data goes</h2>
      <p>
        Logged events are collected by the <b>data writer</b>
        (<code>useDataWriter()</code>) and synced to a
        <a href="https://firebase.google.com/docs/database" target="_blank" rel="noopener">Firebase
        Realtime Database</a> (RTDB). You almost never call the data writer directly —
        the template wires it up for you. It batches writes and flushes them in the
        background, so logging is cheap and a dropped connection won't lose data
        (queued writes are held in <code>localStorage</code> and retried when the
        participant comes back online).
      </p>
      <p>
        The upshot: just log events as they happen and trust that they'll make it to
        the database. The rest of this tutorial is about <i>how</i> to log them.
      </p>
      <PContinue/>
    </EPage>

    <!-- ========================= LOGEVENT ========================= -->

    <EPage name="logEvent">
      <h2>logEvent</h2>
      <p>
        The lowest-level way to record something is <code>logEvent</code>: a name and
        an optional payload object.
      </p>
      <pre b-1 b-gray-200 rounded p3 text-sm overflow-x-auto v-pre><code>logEvent('trial.response', { correct: true, rt: 482 })</code></pre>
      <p mt-3>
        That's it — the event is queued for the database and broadcast to the EventView,
        where it'll appear immediately. Try logging one now and watch the panel on the
        right:
      </p>
      <div flex-center my-3>
        <button b-1 b-gray-300 rounded px-3 py-1 @click="logEvent('demo.click', { at: Date.now() })">
          logEvent('demo.click')
        </button>
      </div>
      <p text-sm text-gray-600>
        <code>logEvent</code> is untyped, so it's easy to typo a name or pass the wrong
        shape. For the events that make up your data, prefer a declared logger — next.
      </p>
      <PContinue/>
    </EPage>

    <!-- ========================= DECLAREEVENTLOGGER ========================= -->

    <EPage name="declareEventLogger">
      <h2>declareEventLogger</h2>
      <p>
        <code>declareEventLogger</code> wraps <code>logEvent</code> with a fixed event
        name and a TypeScript payload type. It returns a typed <b>logger</b> and a
        matching type guard:
      </p>
      <pre b-1 b-gray-200 rounded p3 text-sm overflow-x-auto v-pre><code>const [logResponse, isResponse] =
  declareEventLogger&lt;{ correct: boolean; rt: number }&gt;('trial.response')

logResponse({ correct: true, rt: 482 })  // typechecked</code></pre>
      <p mt-3>
        The logger gives you autocomplete and catches mistakes at compile time. The
        guard (<code>isResponse</code>) is how you later pick these events out of the
        stream — both to select them and to mark trial boundaries, as you'll see in the
        example. Declare one logger per event type your task produces.
      </p>
      <PContinue/>
    </EPage>

    <!-- ========================= EXAMPLE ========================= -->

    <EPage name="example">

    <div w200 mx-auto flex-col gap-6>

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

    </EPage>

  </ESequence>
</template>
