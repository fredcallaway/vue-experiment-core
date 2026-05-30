<script lang="ts" setup>
const props = defineProps<{
  name: string
  prompt: string
  options: string | string[]
  required?: boolean
}>()

const epoch = useEpoch(props.name)
const startedAt = ref(Date.now())
const isComplete = ref(false)

onMounted(() => {
  startedAt.value = Date.now()
})

function logResponse(response: string) {
  logEvent('survey.response', {
    question: props.prompt,
    response,
    rt: Date.now() - startedAt.value,
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
  <ESurveyPage :question="prompt">
    <PButtons :values="options" @click="selectResponse" />
    <div v-if="!required" flex justify-center mt-4>
      <PButton value="Skip" btn-gray @click="skipQuestion" />
    </div>
  </ESurveyPage>
</template>
