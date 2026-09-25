<script lang="ts" setup>
import { useESequence } from '../../composables/useESequence'


const props = defineProps<{
  name?: string,
  disableNavigation?: boolean
  header?: string
}>()

const { E, Sequence } = useESequence(props.name ?? 'ENavigableSequence')

const maxCompletedStep = ref(-1)

const allowNext = computed(() => !props.disableNavigation && maxCompletedStep.value >= E.step.value)
const allowPrev = computed(() => !props.disableNavigation && E.step.value > 0)

const enableNext = () => {
  maxCompletedStep.value = Math.max(maxCompletedStep.value, E.step.value)
}

watch(() => E.step.value, (newVal) => {
  maxCompletedStep.value = Math.max(maxCompletedStep.value, (newVal ?? 0) - 1)
})

// nSteps isn't reactive, so we need to compute it after mount
const nSteps = ref(0)
onMounted(() => {
  nSteps.value = E.nSteps
})
</script>

<template>
  <div class="navigable-sequence relative">
    <!-- HEADER -->
    <div class="flex flex-row flex-gap-4 flex-justify-between flex-items-center mx-10 w-120 mx-auto">
      <PButton
        class="btn-gray-sm text-2xl transition-all transition-duration-300"
        :disabled="!allowPrev"
        @click="E.prev"
        value="prev"
      >
        <span class="i-mdi-arrow-left-bold" />
        <PKey v-if="allowPrev" keys="LEFT" @press="E.prev" />
      </PButton>
      
      <div class="text-3xl font-bold">
        {{ header ?? 'Page' }} {{ E.step.value + 1 }} of {{ nSteps }}
      </div>

      <PButton
        class="text-2xl transition-all transition-duration-300"
        :class="allowNext ? 'btn-primary-sm' : 'btn-gray-sm'"
        :disabled="!allowNext"
        @click="E.next"
        value="next"
      >
        <div class="i-mdi-arrow-right-bold" />
        <PKey v-if="allowNext" keys="RIGHT" @press="E.next" />
      </PButton>
    </div>

    <div class="flex flex-wrap justify-center items-center">
      <Sequence>
        <slot :enableNext="enableNext" :goNext="E.next" :goPrev="E.prev" :epoch="E" />
      </Sequence>
    </div>
  </div>
</template>

<style>

.navigable-sequence .prompt { 
  @apply max-w-160 mx-auto text-lg line-height-snug mt-2 mb-2;
}

</style>
