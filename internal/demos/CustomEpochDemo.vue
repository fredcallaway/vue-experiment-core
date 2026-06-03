<script lang="ts" setup>

// The "custom-epoch" tutorial. The other demos compose *built-in* epochs; this one
// shows how to write your own leaf epoch from scratch — what you do whenever
// EPage/ESequence/ERepeat aren't enough. The epoch itself is in EChoice.vue (read it
// alongside this): a deliberately tiny two-button forced choice, so the *anatomy* is
// visible with nothing else in the way. EClickTest is the same anatomy with timers,
// phases, animation, and scoring layered on.
//
// A custom epoch is a component that: (1) declares typed params with defineParams,
// (2) declares the epoch with useEpoch, (3) logs typed events with declareEventLogger,
// and (4) ends itself with epoch.done(). Optionally it declares a data view that turns
// its events into export rows. EChoice.vue is annotated with each step.

// EChoice lives alongside this demo (not in an auto-imported components dir), so import
// it explicitly. The import also runs EChoice's module script, which is what registers
// its `choice` data view below.
import EChoice from './EChoice.vue'

// Trials to run the epoch over. ERepeat gives each iteration its own epoch instance,
// so RTs and logs are independent and per-trial.
const trials = ['Which feels warmer?', 'Which feels closer?', 'Which feels heavier?']

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
  <div p4>
    <ESequence name="customEpoch">

      <!-- ========================= INTRO ========================= -->
      <EPage name="intro" flex-col gap-4>
        <h2 text-xl font-bold>Writing your own epoch</h2>
        <p>
          The other demos compose <i>built-in</i> epochs. This one builds a brand-new
          leaf epoch — a two-button forced choice, defined in <code>EChoice.vue</code> —
          to show the four things every custom epoch does: declare <b>parameters</b>,
          declare the <b>epoch</b>, log typed <b>events</b>, and call <code>done()</code>
          to hand control back to its parent. A <b>data view</b> turns those events into
          export rows.
        </p>
        <p text-sm text-gray-600>
          Read <code>EChoice.vue</code> next to this page — the comments walk through each
          step. <code>EClickTest</code> is the same anatomy with timers, phases, and
          scoring on top.
        </p>
        <PContinue/>
      </EPage>

      <!-- ========================= EPOCH + DATA VIEW ========================= -->
      <EPage name="example" flex-col gap-6>

        <!-- ERepeat runs the custom epoch once per trial. Each iteration is a fresh epoch
             instance, so RTs and logs are independent and per-trial. -->
        <ERepeat name="trials" :count="trials.length" v-slot="{ step, nSteps }">
          <div text-sm text-gray-500 text-center mb-3>Trial {{ step + 1 }} / {{ nSteps }}</div>
          <EChoice :params="{ enableDelay: 300 }">
            <div text-lg font-bold>{{ trials[step] }}</div>
          </EChoice>
        </ERepeat>

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
      </EPage>

    </ESequence>
  </div>
</template>
