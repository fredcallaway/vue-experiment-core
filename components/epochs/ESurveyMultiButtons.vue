<script lang="ts" setup>
const props = defineProps<{
  name: string
  intro?: string
  sharedPrompt?: string
  options: string | string[]
  prompts: SurveyPrompt[]
}>()

const { Sequence } = useESequence(props.name)
const hasIntro = computed(() => Boolean(props.intro?.trim()))
const questionCount = computed(() => props.prompts.length)
</script>

<template>
  <Transition name="survey-page" mode="out-in">
    <Sequence>
      <EPage v-if="hasIntro" v-slot="{ done }" name="intro">
        <div w-140 mx-auto flex-center gap-4>
          <p text-xl text-center leading-relaxed m-0 v-html="intro" />
          <PButton value="Start" @click="done" />
        </div>
      </EPage>

      <ESurveyMultiButtonQuestion
        v-for="(prompt, index) in prompts"
        :key="index"
        :name="`q${index + 1}`"
        :prompt="prompt"
        :shared-prompt="sharedPrompt"
        :options="options"
        :question-index="index"
        :question-count="questionCount"
      />
    </Sequence>
  </Transition>
</template>

<style scoped>
.survey-page-enter-active,
.survey-page-leave-active {
  transition: opacity 0.5s;
}

.survey-page-enter-from,
.survey-page-leave-to {
  opacity: 0;
}
</style>
