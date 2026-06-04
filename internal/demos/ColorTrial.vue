<script lang="ts" setup>

// One trial of the toy color task, written as a custom component — the pattern real
// experiments use for anything with internal structure. The trial has two phases
// (choice -> feedback) that share a piece of state (`correct`). Because it's a single
// component, that state is just a local `ref`: no need to hoist it to the parent the
// way sibling EPages would force. This is the component-first pattern the basics demo
// describes, and what tasks like ECircleGraph / ECorsi do in practice.

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
