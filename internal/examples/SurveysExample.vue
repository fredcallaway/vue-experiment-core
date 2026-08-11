<script lang="ts">

// Surveys are epochs sequenced by ESurveyWrapper. Each survey epoch logs a
// survey.response event: { question, response, rt }. Core does not declare a
// survey data view — each project declares one for the columns it wants.

declareDataView('survey', (session: SessionData) =>
  session.events
    .filter(e => e.eventType === 'survey.response')
    .map(e => e.data as { question: string; response: string; rt: number })
)

export default {}

</script>

<template>
  <div p4>
    <ESequence name="main">

      <!-- Option strings use `|` separators because options contain spaces. -->
      <ESurveyWrapper name="debrief">

        <!-- One question, fixed options. `required` hides the Skip button. -->
        <ESurveyButtons
          name="enjoy"
          prompt="How much did you enjoy this task?"
          options="not at all | a little | a lot"
          required
        />

        <!-- Several questions sharing one option set; a single mounted epoch, so
             the prompt and buttons stay put between questions. -->
        <ESurveyMultiButtons
          name="agree"
          shared-prompt="How much do you agree?"
          options="disagree | neutral | agree"
          :prompts="['The instructions were clear.', 'The task was too long.']"
        />

        <ESurveyText
          name="comments"
          prompt="Any comments? (optional)"
          placeholder="Type here…"
        />
      </ESurveyWrapper>

      <EPage name="end" text-center>
        Done — see the <code>survey</code> view in the DataView panel in
        <NuxtLink to="/dev">/dev</NuxtLink>.
      </EPage>

    </ESequence>
  </div>
</template>
