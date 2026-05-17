<script lang="ts" setup>

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
  <div class="navigable-sequence" relative>
    <!-- HEADER -->
    <div flex="~ row gap-4 justify-between items-center" mx-10 w-120 mx-auto>
      <PButton btn-gray-sm text-2xl :disabled="!allowPrev" @click="E.prev" value="prev" 
        transition-all transition-duration-300 
      >
        <span class="i-mdi-arrow-left-bold" />
        <PKey v-if="allowPrev" keys="LEFT" @press="E.prev" />
      </PButton>
      
      <div text-3xl font-bold >
        {{ header ?? 'Page' }} {{ E.step.value + 1 }} of {{ nSteps }}
      </div>

      <PButton :class="allowNext ? 'btn-primary-sm' : 'btn-gray-sm'" text-2xl :disabled="!allowNext" @click="E.next" value="next"
        transition-all transition-duration-300 
      >
        <div class="i-mdi-arrow-right-bold" />
        <PKey v-if="allowNext" keys="RIGHT" @press="E.next" />
      </PButton>
    </div>

    <div flex-center>
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
