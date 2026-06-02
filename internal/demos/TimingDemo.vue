<script lang="ts" setup>

// The "timing" tutorial. Three primitives cover almost all timing needs:
//
//   useTimer(ms)              — a reactive countdown with pause/resume/reset, a
//                               formattedTimeLeft for display, and onDone/promise.
//   <EPage :duration="ms">    — a page that auto-advances after a fixed delay
//                               (good for fixed-duration feedback / fixation).
//   useLocalAsync().sleep(ms) — an awaitable delay that is cancelled if the
//                               component unmounts, so it's safe in async epoch logic.
//
// We show each in turn. The countdown is interactive; the other two auto-advance, so
// this demo runs as a plain ESequence rather than a navigable one.

// A 10-second countdown, started paused so the participant controls it.
const timer = useTimer(10_000, { immediate: false })

// An awaited sleep, used to gate a reveal. useLocalAsync ties the timeout to this
// component, so a settled/abandoned sleep won't fire after unmount.
const { sleep } = useLocalAsync()
const revealed = ref(false)
const runSleep = async () => {
  revealed.value = false
  await sleep(1500)
  revealed.value = true
}

</script>

<template>
  <div w150 mx-auto p10 flex-col gap-6>

    <ESequence name="timing" flex-col gap-5>

      <!-- ===================== Intro ===================== -->
      <EPage name="intro" flex-col gap-3 b-1 b-gray-200 rounded p6>
        <h2 text-xl font-bold>Timing</h2>
        <p>
          Countdowns, fixed-duration pages, and awaitable delays — the three timing
          primitives you'll reach for in trials.
        </p>
        <PContinue button="Start" />
      </EPage>

      <!-- ===================== useTimer ===================== -->
      <EPage name="timer" flex-col gap-3 b-1 b-gray-200 rounded p6>
        <div font-bold>useTimer</div>
        <p text-sm text-gray-600>
          A reactive countdown. <code>formattedTimeLeft</code> updates each second;
          <code>pause</code>/<code>resume</code>/<code>reset</code> control it, and
          <code>onDone</code>/<code>promise</code> fire when it elapses.
        </p>
        <div text-4xl font-mono text-center my-2>{{ timer.formattedTimeLeft }}</div>
        <div flex-center gap-2>
          <PButton value="Start" :disabled="timer.status.value === 'running'" @click="timer.resume" />
          <PButton value="Pause" color="gray" :disabled="timer.status.value !== 'running'" @click="timer.pause" />
          <PButton value="Reset" color="gray" @click="timer.reset" />
        </div>
        <PContinue button="Next" />
      </EPage>

      <!-- ===================== EPage :duration ===================== -->
      <!-- This page has no continue control; :duration makes it advance on its own
           after 1200ms. Common for fixation crosses and fixed-length feedback. -->
      <EPage name="fixation" :duration="1200" flex-col flex-center gap-3 b-1 b-gray-200 rounded p10>
        <div text-5xl>+</div>
        <div text-sm text-gray-500>Fixed-duration page — auto-advances in 1.2 s…</div>
      </EPage>

      <!-- ===================== useLocalAsync().sleep ===================== -->
      <EPage name="sleep" flex-col gap-3 b-1 b-gray-200 rounded p6 min-h-50>
        <div font-bold>useLocalAsync().sleep</div>
        <p text-sm text-gray-600>
          An awaitable delay for async epoch logic — here it gates a reveal. Because it
          comes from <code>useLocalAsync</code>, it's cancelled on unmount, so it can't
          fire into a torn-down component.
        </p>
        <PButton value="Reveal after 1.5 s" @click="runSleep" />
        <div v-if="revealed" text-green text-lg>Revealed!</div>
        <PContinue button="Finish" />
      </EPage>

    </ESequence>
  </div>
</template>
