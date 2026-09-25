<script lang="ts" setup>
import { useLocalAsync } from '../../composables/useLocalAsync'
import { useTimer } from '../../composables/useTimer'


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
  <div class="p4">
    <ESequence name="main">

      <EContinue class="flex-col gap-3" name="timer" button="Next">
        <div class="font-bold">useTimer</div>
        <div class="text-4xl font-mono text-center my-2">{{ timer.formattedTimeLeft }}</div>
        <div class="flex flex-wrap justify-center items-center gap-2">
          <PButton value="Start" :disabled="timer.status.value === 'running'" @click="timer.resume" />
          <PButton value="Pause" color="gray" :disabled="timer.status.value !== 'running'" @click="timer.pause" />
          <PButton value="Reset" color="gray" @click="timer.reset" />
        </div>
      </EContinue>

      <!-- No continue control; :duration advances it automatically. -->
      <EPage class="flex-col flex flex-wrap justify-center items-center gap-3" name="fixation" :duration="1200">
        <div class="text-5xl">+</div>
        <div class="text-sm text-gray-500">EPage :duration</div>
      </EPage>

      <EContinue class="flex-col gap-3" name="sleep" button="Finish">
        <div class="font-bold">useLocalAsync().sleep</div>
        <PButton value="Reveal after 1.5 s" @click="runSleep" />
        <div class="text-green text-lg" v-if="revealed">Revealed!</div>
      </EContinue>

    </ESequence>
  </div>
</template>
