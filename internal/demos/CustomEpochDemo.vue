<script lang="ts">

// The "custom-epoch" tutorial. The other demos compose *built-in* epochs (EPage,
// ESequence, ERepeat); this one is itself a custom leaf epoch written from scratch —
// what you do whenever the built-ins aren't enough. It's a deliberately tiny two-button
// forced choice, so the *anatomy* of a custom epoch is visible with nothing else in the
// way. EClickTest is the same anatomy with timers, phases, animation, and scoring layered on.
//
// A custom epoch is a component that: (1) declares typed params with defineParams,
// (2) declares the epoch with useEpoch, (3) logs typed events with declareEventLogger,
// and (4) ends itself with epoch.done(). Optionally it declares a data view that turns
// its events into export rows.
//
// The module-level <script> declares things that should exist once per *component*
// (not once per instance): the parameter set, the event logger, and the data view.
// The <script setup> below is the per-instance logic.

// 1. Parameters: typed, with defaults; overridable through the `params` prop.
export const [provideChoiceParams, useChoiceParams] = defineParams({
  // Delay before the buttons become clickable (ms) — discourages reflexive clicks.
  enableDelay: 300,
})
export type ChoiceParams = ReturnType<typeof useChoiceParams>

// 3. Events: one typed log per response. `isChoice` is the matching type guard, used
//    by the data view (and by anyone filtering the event stream for these events).
export const [logChoice, isChoice] = declareEventLogger<{ option: string; rt: number }>('choice.made')

// Data view: filter the session's events to ours and emit one row per response. Keep
// the transform next to the event shape it reads. This is what gets exported as a table.
declareDataView('choice', (session: SessionData) =>
  session.events.filter(isChoice).map(e => e.data)
)

</script>

<script lang="ts" setup>

const props = defineProps<{ params?: Partial<ChoiceParams> }>()
const params = useChoiceParams(props.params)

// 2. Declare the epoch BEFORE composables that depend on epoch context. useEpoch
//    returns the epoch handle, whose done()/next() drive the parent.
const epoch = useEpoch('choice')

// Buttons start disabled and enable after params.enableDelay. We time RT from the
// moment they become clickable.
const ready = useTimeout(params.enableDelay)
const enabledAt = ref(0)
watchImmediate(ready, (r) => { if (r) enabledAt.value = performance.now() })

const onChoice = (option: string) => {
  // 3. Log a typed event, then 4. end the epoch — control returns to the parent.
  logChoice({ option, rt: performance.now() - enabledAt.value })
  epoch.done()
}

// To show the data view live, collect the running session's events (the same thing the
// export path feeds to the view) and run the declared transform over them. A real
// export reads the saved SessionData from disk; here we just watch the event bus.
const events = reactive<LogEvent[]>([])
useLogEventBus().on(e => events.push(e))
const choiceView = useDataViews().choice
const choiceRows = computed(() =>
  choiceView.fn({ meta: {} as any, events: [...events] }) as { option: string; rt: number }[]
)

</script>

<template>
  <div p4 flex-col gap-6>

    <!-- ========================= INTRO ========================= -->
    <p text-sm text-gray-600>
      This demo <i>is</i> a custom epoch, written from scratch. Read its source —
      <code>CustomEpochDemo.vue</code> — alongside the live example below; the comments
      walk through the four things every custom epoch does.
    </p>

    <!-- ========================= THE EPOCH ========================= -->
    <div flex-col flex-center gap-4 min-h-40>
      <div text-lg font-bold>Which feels warmer?</div>
      <PButtons values="left right" :disabled="!ready" @click="onChoice" />
    </div>

    <!-- ========================= DATA VIEW ========================= -->
    <!-- The live data view: every choice.made event becomes one row here, the exact
         shape a project would export. Make a choice and watch a row appear. -->
    <div>
      <h3 font-bold mb-2>Data view (<code>choice</code>)</h3>
      <p text-sm text-gray-600 mb-2>
        Each response logs a <code>choice.made</code> event; the data view maps those to
        rows. This is what you'd download.
      </p>
      <table v-if="choiceRows.length" text-sm b-1 b-gray-200 rounded w-full>
        <thead bg-gray-50>
          <tr><th p2 text-left>option</th><th p2 text-left>rt (ms)</th></tr>
        </thead>
        <tbody>
          <tr v-for="(row, i) in choiceRows" :key="i" b-t b-gray-100>
            <td p2>{{ row.option }}</td>
            <td p2>{{ Math.round(row.rt) }}</td>
          </tr>
        </tbody>
      </table>
      <div v-else text-sm text-gray-400 italic>No responses yet — make a choice above.</div>
    </div>

  </div>
</template>
