<script lang="ts" setup>

const props = defineProps<{
  name?: string,
  skipWelcome?: boolean,
  disableNavigation?: boolean
}>()

const { E, Sequence } = useESequence(props.name ?? 'instructions')

const withEpoch = <T>(f: (E: IndexableEpoch) => T ) => {
  return () => {
    return f(E)
  }
}

const maxCompletedStep = ref(-1)

const step = computed(withEpoch((E) => E.step.value))
const allowNext = computed(withEpoch((E) => !props.disableNavigation && maxCompletedStep.value >= E.step.value))
const allowPrev = computed(withEpoch((E) => !props.disableNavigation && E.step.value > 1)) // no back to welcome

const enableNext = withEpoch((E) => {
  maxCompletedStep.value = Math.max(maxCompletedStep.value, E.step.value)
})

watch(() => E.step.value, (newVal) => {
  maxCompletedStep.value = Math.max(maxCompletedStep.value, (newVal ?? 0) - 1)
})

const goNext = withEpoch((E) => E.next())
const goPrev = withEpoch((E) => E.prev())

// nSteps isn't reactive, so we need to compute it after mount
const nSteps = ref(0)
onMounted(() => {
  nSteps.value = E.nSteps
})
</script>

<template>
  <div class="instructions" relative>
    <!-- HEADER -->
    <div flex="~ row gap-4 justify-between items-center" mx-10 w-120 mx-auto>
      <PButton btn-gray-sm text-2xl :disabled="!allowPrev" @click="goPrev" value="prev" 
        transition-all transition-duration-300 
      >
        <span class="i-mdi-arrow-left-bold" />
        <PKey v-if="allowPrev" keys="LEFT" @press="goPrev" />
      </PButton>
      
      <div text-3xl font-bold >
        <template v-if="E.step.value == 0 && !skipWelcome">
          Welcome!
        </template>
        <template v-else>
          Instructions {{ step + 1 }} of {{ nSteps }}
        </template>
      </div>

      <PButton :class="allowNext ? 'btn-primary-sm' : 'btn-gray-sm'" text-2xl :disabled="!allowNext" @click="goNext" value="next"
        transition-all transition-duration-300 
      >
        <div class="i-mdi-arrow-right-bold" />
        <PKey v-if="allowNext" keys="RIGHT" @press="goNext" />
      </PButton>
    </div>

    <div flex-center>
      <Sequence>
        <EPage v-if="!skipWelcome" @mounted="enableNext" name="welcome">
          <div class="prompt" max-w-130 >
            Thanks for participating in our experiment! We'll start with some instructions.
            Navigate with arrow keys or the buttons at the top.
          </div>
        </EPage>
        <slot :enableNext="enableNext" :goNext="goNext" />
      </Sequence>
    </div>
  </div>
</template>

<style>

.instructions .prompt { 
  @apply w-160 mx-auto text-lg line-height-snug mt-2 mb-2;
}

</style>
