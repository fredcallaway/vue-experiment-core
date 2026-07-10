<script lang="ts" setup>

// The three timing primitives:
//   useTimer(ms)              — reactive countdown with pause/resume/reset/onDone
//   <EPage :duration="ms">    — a page that auto-advances (fixation, fixed feedback)
//   useLocalAsync().sleep(ms) — awaitable delay, cancelled if the component unmounts
//
// Always use useLocalAsync's sleep (not setTimeout) in epoch logic so pending
// delays can't fire into an unmounted component.

const timer = useTimer(10_000, { immediate: false })

const { sleep } = useLocalAsync()
const revealed = ref(false)
const runSleep = async () => {
  revealed.value = false
  await sleep(1500)
  revealed.value = true
}

</script>

<template>
  <div p4>
    <ESequence name="main">

      <EContinue name="timer" button="Next" flex-col gap-3>
        <div font-bold>useTimer</div>
        <div text-4xl font-mono text-center my-2>{{ timer.formattedTimeLeft }}</div>
        <div flex-center gap-2>
          <PButton value="Start" :disabled="timer.status.value === 'running'" @click="timer.resume" />
          <PButton value="Pause" color="gray" :disabled="timer.status.value !== 'running'" @click="timer.pause" />
          <PButton value="Reset" color="gray" @click="timer.reset" />
        </div>
      </EContinue>

      <!-- No continue control; :duration advances it automatically. -->
      <EPage name="fixation" :duration="1200" flex-col flex-center gap-3>
        <div text-5xl>+</div>
        <div text-sm text-gray-500>Fixed-duration page — auto-advances in 1.2 s…</div>
      </EPage>

      <EContinue name="sleep" button="Finish" flex-col gap-3>
        <div font-bold>useLocalAsync().sleep</div>
        <PButton value="Reveal after 1.5 s" @click="runSleep" />
        <div v-if="revealed" text-green text-lg>Revealed!</div>
      </EContinue>

    </ESequence>
  </div>
</template>
