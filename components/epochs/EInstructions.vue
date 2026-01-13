<script lang="ts" setup>

const props = defineProps<{
  name?: string,
  skipWelcome?: boolean,
  disableNavigation?: boolean
}>()

const epoch = useIndexableEpoch(props.name ?? 'instructions', 0)

const withEpoch = <T>(f: (E: IndexableEpoch) => T | null) => {
  return (): T | null => {
    return f(epoch)
  }
}

const maxCompletedStep = ref(-1)

const step = computed(withEpoch((E) => E.step.value))
const allowNext = computed(withEpoch((E) => !props.disableNavigation && maxCompletedStep.value >= E.step.value))
const allowPrev = computed(withEpoch((E) => !props.disableNavigation && E.step.value > 1)) // no back to welcome

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
    <div flex="~ row gap-4 justify-between items-center" mx-10 w-120 mx-auto>
      <PButton btn-gray-sm text-2xl :disabled="!allowPrev" @click="goPrev" value="prev" 
        transition-all transition-duration-300 
      >
        <span class="i-mdi-arrow-left-bold" />
        <PKey v-if="allowPrev" keys="LEFT" @press="goPrev" />
      </PButton>
      
      <div text-3xl font-bold >
        <template v-if="epoch.step.value == 0">
          Welcome!
        </template>
        <template v-else>
          Instructions {{ epoch.step.value }} of {{ epoch.nSteps - Number(skipWelcome) }}
        </template>
      </div>

      <PButton :class="allowNext ? 'btn-primary-sm' : 'btn-gray-sm'" text-2xl :disabled="!allowNext" @click="goNext" value="next"
        transition-all transition-duration-300 
      >
        <div class="i-mdi-arrow-right-bold" />
        <PKey v-if="allowNext" keys="RIGHT" @press="goNext" />
      </PButton>
    </div>

    <ESequence :epoch="epoch" flex-center>

      <EPage v-if="!skipWelcome" @mounted="enableNext" name="welcome">
        <div class="prompt">
          Thanks for participating in our experiment! We'll start with some instructions.
          Navigate with arrow keys or the buttons at the top.
          <div t0 r10 italic rotate-10 text-sm>
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
