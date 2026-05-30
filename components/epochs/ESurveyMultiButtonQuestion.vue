<script lang="ts" setup>
const props = defineProps<{
  name: string
  prompt: SurveyPrompt
  sharedPrompt?: string
  options: string | string[]
  questionIndex: number
  questionCount: number
}>()

const epoch = useEpoch(props.name)
const parsedPrompt = computed(() => normalizeSurveyPrompt(props.prompt))
const values = computed(() => normalizeSurveyOptions(props.options))
const startedAt = ref(Date.now())
const isComplete = ref(false)

onMounted(() => {
  startedAt.value = Date.now()
})

function finish(response: string, numericResponse?: number) {
  if (isComplete.value) return
  isComplete.value = true
  logSurveyResponse({
    question: parsedPrompt.value.question,
    response,
    rt: Date.now() - startedAt.value,
    flags: parsedPrompt.value.flags,
    numericResponse,
    maxResponse: values.value.length - 1,
  })
  epoch.done()
}

function selectResponse(response: string) {
  finish(response, values.value.indexOf(response))
}
</script>

<template>
  <ESurveyPage :prompt="sharedPrompt" :question="parsedPrompt.question">
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
