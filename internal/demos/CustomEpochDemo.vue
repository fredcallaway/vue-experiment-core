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

</script>

<template>
  <div p4 flex-col gap-6>

    <!-- ========================= INTRO ========================= -->
    <h2>Custom Epochs</h2>
    <p ext-gray-600>
      This demo shows how to write epochs with complex internal
      state and control flow. Open the source file — 
      <code>CustomEpochDemo.vue</code> — to follow along.
    </p>

    <!-- ========================= THE EPOCH ========================= -->
    <div flex-col flex-center gap-4 min-h-40>
      <div text-lg font-bold>Which feels warmer?</div>
      <PButtons values="left right" :disabled="!ready" @click="onChoice" />
    </div>

  </div>
</template>
