<script lang="ts" setup>


const seq = useTemplateRef<IndexableEpoch>('seq')
const epochRef = computed<IndexableEpoch | null>(() => {
  if (!seq.value) return null
  // @ts-ignore
  return seq.value.epoch
})

const withEpoch = (f: (E: IndexableEpoch) => void) => {
  return () => {
    if (!epochRef.value) return false
    return f(epochRef.value)
  }
}

const maxCompletedStep = ref(-1)

const step = computed(withEpoch((E) => E.step.value))
const allowNext = computed(withEpoch((E) => maxCompletedStep.value >= E.step.value))
const allowPrev = computed(withEpoch((E) => E.step.value > 0))

useInspect({allowNext, allowPrev, maxCompletedStep, step})

const enableNext = withEpoch((E) => {
  console.log('enableNext', E.step.value)
  maxCompletedStep.value = Math.max(maxCompletedStep.value, E.step.value)
})

const goNext = withEpoch((E) => E.next())
const goPrev = withEpoch((E) => E.prev())

const bonus = useBonus()

</script>

<template>
  <div class="instructions" relative>
    <!-- HEADER -->
    <div flex="~ row gap-4 justify-between items-center" mx-10>
      <PButton btn-gray-sm text-2xl :disabled="!allowPrev" @click="goPrev" value="prev">
        <span class="i-mdi-arrow-left-bold" />
        <PKey v-if="allowPrev" keys="LEFT" @press="goPrev" />
      </PButton>
      
      <div v-if="epochRef" text-3xl font-bold>Instructions {{ epochRef.step.value + 1 }} of {{ epochRef.nSteps }}</div>

      <PButton :class="allowNext ? 'btn-primary-sm' : 'btn-gray-sm'" text-2xl :disabled="!allowNext" @click="goNext" value="next">
        <div class="i-mdi-arrow-right-bold" />
        <PKey v-if="allowNext" keys="RIGHT SPACE" @press="goNext" />
      </PButton>
    </div>

    <ESequence name="instructions" ref="seq">

      <EPage :done="enableNext">
        <header>
          Thanks for participating in our experiment! We'll start with some instructions.
          Navigate with arrow keys or the buttons at the top.
          <div t4 r5 italic rotate-10 text-sm v-show="allowNext">
            click me!
          </div>
        </header>
        <EDelay :ms="3000" />
      </EPage>

      <EPage>
        <header>
          <div card-yellow >
            <h3>Warning!</h3>
            Do not refresh the page or close the browser window during the experiment.
            If you do, you will not be able to complete the study!
          </div>
        </header>
        <EButtons :values="['I will not refresh the page']" />
      </EPage>

      <slot :enableNext="enableNext" :goNext="goNext" />

    </ESequence>
  </div>
</template>

<style>

.instructions .EPage {
  @apply flex-center flex-col w-800px;
  
  header {
    @apply w-140 min-h-28 mx-auto text-lg line-height-snug mt-3 mb-3;
  }
}

</style>
