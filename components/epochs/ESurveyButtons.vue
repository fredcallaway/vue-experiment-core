<script lang="ts" setup>
const props = defineProps<{
  name: string
  prompt: SurveyPrompt
  options: string | string[]
  required?: boolean
}>()

const epoch = useEpoch(props.name)
const parsedPrompt = computed(() => normalizeSurveyPrompt(props.prompt))
const values = computed(() => normalizeSurveyOptions(props.options))
const startedAt = ref(Date.now())
const isComplete = ref(false)

onMounted(() => {
  startedAt.value = Date.now()
})

function logResponse(response: string) {
  logSurveyResponse({
    question: parsedPrompt.value.question,
    response,
    rt: Date.now() - startedAt.value,
    flags: parsedPrompt.value.flags,
  })
}

function selectResponse(response: string) {
  if (isComplete.value) return
  isComplete.value = true
  logResponse(response)
  epoch.done()
}

function skipQuestion() {
  if (isComplete.value) return
  isComplete.value = true
  logResponse('SKIP')
  epoch.done()
}
</script>

<template>
  <ESurveyPage :question="parsedPrompt.question">
    <PButtons :values="values" @click="selectResponse" />
    <div v-if="!required" flex justify-center mt-4>
      <PButton value="Skip" btn-gray @click="skipQuestion" />
    </div>
  </ESurveyPage>
</template>
