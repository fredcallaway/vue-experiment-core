<script lang="ts" setup>

const props = defineProps<{
  skipWelcome?: boolean,
}>()

const epoch = useIndexableEpoch('instructions', 0)

const withEpoch = <T>(f: (E: IndexableEpoch) => T | null) => {
  return (): T | null => {
    return f(epoch)
  }
}

const maxCompletedStep = ref(-1)

const step = computed(withEpoch((E) => E.step.value))
const allowNext = computed(withEpoch((E) => maxCompletedStep.value >= E.step.value))
const allowPrev = computed(withEpoch((E) => E.step.value > 0))

const enableNext = withEpoch((E) => {
  console.log('enableNext', E.step.value)
  maxCompletedStep.value = Math.max(maxCompletedStep.value, E.step.value)
})

watch(() => epoch.step.value, (newVal) => {
  maxCompletedStep.value = Math.max(maxCompletedStep.value, (newVal ?? 0) - 1)
})

const goNext = withEpoch((E) => E.next())
const goPrev = withEpoch((E) => E.prev())

</script>

<template>
  <div class="instructions" relative>
    <!-- HEADER -->
    <div flex="~ row gap-4 justify-between items-center" mx-10>
      <PButton btn-gray-sm text-2xl :disabled="!allowPrev" @click="goPrev" value="prev">
        <span class="i-mdi-arrow-left-bold" />
        <PKey v-if="allowPrev" keys="LEFT" @press="goPrev" />
      </PButton>
      
      <div text-3xl font-bold>Instructions {{ epoch.step.value + 1 - Number(skipWelcome) }} of {{ epoch.nSteps - Number(skipWelcome) }}</div>

      <PButton :class="allowNext ? 'btn-primary-sm' : 'btn-gray-sm'" text-2xl :disabled="!allowNext" @click="goNext" value="next">
        <div class="i-mdi-arrow-right-bold" />
        <PKey v-if="allowNext" keys="RIGHT" @press="goNext" />
      </PButton>
    </div>

    <ESequence :epoch="epoch" flex-center>

      <EPage v-if="!skipWelcome" @mounted="enableNext" name="welcome">
        <div class="prompt">
          Thanks for participating in our experiment! We'll start with some instructions.
          Navigate with arrow keys or the buttons at the top.
          <div t4 r5 italic rotate-10 text-sm>
            click me!
          </div>
        </div>
      </EPage>

      <slot :enableNext="enableNext" :goNext="goNext" />

    </ESequence>
  </div>
</template>

<style>

.instructions .prompt { 
  @apply w-160 mx-auto text-lg line-height-snug mt-2 mb-2;
}

</style>
