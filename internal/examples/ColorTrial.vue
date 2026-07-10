<script lang="ts" setup>

// A minimal custom trial used by the experiment example. Two phases
// (choice -> feedback) share local state (`correct`) — no hoisting to the parent,
// as an ESequence of sibling pages would force. For the full trial anatomy
// (params, typed events, data view), see StroopTrial.vue.

const props = defineProps<{
  target: string       // the color the participant should click
  colors: string[]     // the options to show
}>()

const emit = defineEmits<{ (e: 'correct'): void }>()

// A phase epoch: one epoch, several visual phases it moves between without remounting.
const epoch = usePhaseEpoch('trial', ['choice', 'feedback'])
const { Phase, goToPhase } = useDisplayPhases(epoch.phases)
watch(epoch.phase, goToPhase)

// Trial-local state — shared freely across phases, no hoisting needed.
const correct = ref(false)

const choose = (color: string) => {
  correct.value = color === props.target
  if (correct.value) emit('correct')
  epoch.goTo('feedback')
}

// The feedback phase shows for a fixed time, then the trial finishes.
const { sleep } = useLocalAsync()
watch(epoch.phase, async (phase) => {
  if (phase === 'feedback') {
    await sleep(900)
    epoch.done()
  }
})

</script>

<template>
  <div text-center>
    <Phase which="choice" flex-center flex-col gap-4>
      <p>Click the <b :class="`text-${target}`">{{ target }}</b> button.</p>
      <PButtons
        :values="colors"
        :classes="colors.map(c => `btn-${c}`)"
        class="gap-4"
        @click="choose"
      />
    </Phase>

    <Phase which="feedback" text-3xl>
      <div v-if="correct" text-green>correct!</div>
      <div v-else text-red>incorrect</div>
    </Phase>
  </div>
</template>
