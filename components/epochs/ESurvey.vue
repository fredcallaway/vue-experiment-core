<script lang="ts" setup>
const { done } = useEpoch("Survey")

const formData = reactive({
  difficulty: "",
  understood: "",
  fun: "",
  feedback: "",
})

const submit = () => {
  logEvent("survey.submit", formData)
  done()
}
</script>

<template>
  <div w-600px mx-auto>
    <h1>You're done!</h1>

    <p>
      Thanks for participating! We have a few quick questions before you go.
    </p>

    <form class="flex flex-col gap-4">
      <RadioButtons
        question="How difficult was the experiment?"
        :options="['too easy', 'just right', 'too hard']"
        v-model="formData.difficulty"
      />

      <RadioButtons
        question="Did you understand what you were doing?"
        :options="['yes', 'no']"
        v-model="formData.understood"
      />

      <RadioButtons
        question="How fun was the experiment?"
        :options="['worse than average', 'typical', 'better than average']"
        v-model="formData.fun"
      />

      <fieldset>
        <h4>Do you have any other feedback? (optional)</h4>
        <textarea
          id="feedback"
          v-model="formData.feedback"
          rows="3"
          w-580px
        ></textarea>
      </fieldset>

      <PButton value="Submit" btn-primary @click="submit" />
    </form>
  </div>
</template>

<style scoped>
fieldset {
  border: inherit;
  margin: inherit;
  padding: inherit;
}
textarea {
  font-family: inherit;
  font-size: inherit;
  @apply px-2 py-1;
}
</style>

<script lang="ts">
declareDataView("survey", (sessionData: SessionData) => {
  return R.pipe(
    sessionData.events,
    R.filter((e) => e.eventType == "survey.submit"),
    R.map(R.omit(["eventType", "currentEpochId"]))
  )
})
</script>
