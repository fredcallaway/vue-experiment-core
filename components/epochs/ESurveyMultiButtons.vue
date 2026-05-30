<script lang="ts" setup>
const props = defineProps<{
  name: string
  intro?: string
  sharedPrompt?: string
  options: string | string[]
  prompts: SurveyPrompt[]
}>()

if (props.prompts.length === 0) {
  throw new Error(`ESurveyMultiButtons "${props.name}" requires at least one prompt`)
}

const epoch = useEpoch(props.name)
const values = computed(() => normalizeSurveyOptions(props.options))
const showIntro = ref(Boolean(props.intro?.trim()))
const questionIndex = ref(0)
const startedAt = ref(Date.now())
const isComplete = ref(false)
const questionCount = computed(() => props.prompts.length)

const currentPrompt = computed(() => normalizeSurveyPrompt(props.prompts[questionIndex.value]))

onMounted(() => {
  if (!showIntro.value) resetTimer()
})

function resetTimer() {
  startedAt.value = Date.now()
}

function startSurvey() {
  showIntro.value = false
  resetTimer()
}

function finish(response: string, numericResponse?: number) {
  if (isComplete.value) return
  logSurveyResponse({
    question: currentPrompt.value.question,
    response,
    rt: Date.now() - startedAt.value,
    flags: currentPrompt.value.flags,
    numericResponse,
    maxResponse: values.value.length - 1,
  })
  advanceQuestion()
}

function selectResponse(response: string) {
  finish(response, values.value.indexOf(response))
}

function advanceQuestion() {
  if (questionIndex.value === questionCount.value - 1) {
    isComplete.value = true
    epoch.done()
    return
  }

  questionIndex.value++
  resetTimer()
}
</script>

<template>
  <div v-if="showIntro" w-140 mx-auto flex-center gap-4>
    <p text-xl text-center leading-relaxed m-0 v-html="intro" />
    <PButton value="Start" @click="startSurvey" />
  </div>

  <ESurveyPage v-else :prompt="sharedPrompt" :question="currentPrompt.question">
    <PButtons :values="values" @click="selectResponse" />
    <div flex justify-center mt-4>
      <PButton value="Skip" btn-gray @click="finish('SKIP')" />
    </div>
    <template #footer>
      <div text-center text-gray-600 text-sm pt-4>
        Question {{ questionIndex + 1 }} of {{ questionCount }}
      </div>
    </template>
  </ESurveyPage>
</template>
