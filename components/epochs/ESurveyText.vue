<script lang="ts" setup>
const props = defineProps<{
  name: string
  prompt: string
  placeholder?: string
  required?: boolean
}>()

const epoch = useEpoch(props.name)
const response = ref('')
const startedAt = ref(Date.now())
const isComplete = ref(false)

const canSubmit = computed(() => response.value.trim().length > 0)

onMounted(() => {
  startedAt.value = Date.now()
})

function logResponse(value: string) {
  logEvent('survey.response', {
    question: props.prompt,
    response: value,
    rt: Date.now() - startedAt.value,
  })
}

function finish(value: string) {
  if (isComplete.value) return
  isComplete.value = true
  logResponse(value)
  epoch.done()
}

function submitResponse() {
  if (!canSubmit.value) return
  finish(response.value)
}
</script>

<template>
  <ESurveyPage :question="prompt">
    <div flex flex-col gap-4 items-center>
      <textarea
        v-model="response"
        input
        rows="4"
        w-full
        max-w-620px
        :placeholder="placeholder"
      />
      <PButton value="Submit" :disabled="!canSubmit" @click="submitResponse" />
    </div>
    <div v-if="!required" flex justify-center mt-4>
      <PButton value="Skip" btn-gray @click="finish('SKIP')" />
    </div>
  </ESurveyPage>
</template>
