<script lang="ts">

// The "surveys" tutorial. Surveys are built from component epochs wrapped in an
// ESurveyWrapper (which is just an ESequence). Each survey epoch logs a
// `survey.response` event with { question, response, rt }:
//
//   ESurveyButtons       — one question, pick from a set of options
//   ESurveyMultiButtons  — several questions sharing one option set (one mounted epoch)
//   ESurveyText          — a free-text response
//
// The simplified branch removed the core survey data view, so each project declares
// its own for the columns it wants. Here is a minimal one that turns every
// survey.response event into a row.
declareDataView('survey', (session: SessionData) =>
  session.events
    .filter(e => e.eventType === 'survey.response')
    .map(e => e.data as { question: string; response: string; rt: number })
)

</script>

<script lang="ts" setup>

// Live view of the responses, via the declared data view.
const events = reactive<LogEvent[]>([])
useLogEventBus().on((e) => { if (e.eventType === 'survey.response') events.push(e) })
const surveyView = useDataViews().survey
const rows = computed(() =>
  surveyView.fn({ meta: {} as any, events: [...events] }) as
    { question: string; response: string; rt: number }[]
)

</script>

<template>
  <div w160 mx-auto p10 flex-col gap-6>

    <div>
      <h2 text-xl font-bold>Surveys</h2>
      <p mt-2>
        Survey epochs wrapped in an <code>ESurveyWrapper</code>. Each logs a
        <code>survey.response</code> event; the project declares a data view to export
        them. Answer the questions and watch the rows fill in.
      </p>
    </div>

    <!-- ESurveyWrapper sequences its children, finishing after the last. Note the
         options strings use `|` to separate values, since options contain spaces. -->
    <div b-1 b-gray-200 rounded p6 min-h-60>
      <ESurveyWrapper name="demoSurvey">

        <!-- Single question, fixed options. `required` hides the Skip button. -->
        <ESurveyButtons
          name="enjoy"
          prompt="How much did you enjoy this task?"
          options="not at all | a little | a lot"
          required
        />

        <!-- Several questions sharing one option set, kept in one mounted epoch so
             the prompt and buttons stay put between questions. -->
        <ESurveyMultiButtons
          name="agree"
          shared-prompt="How much do you agree?"
          options="disagree | neutral | agree"
          :prompts="['The instructions were clear.', 'The task was too long.']"
        />

        <!-- Free text. -->
        <ESurveyText
          name="comments"
          prompt="Any comments? (optional)"
          placeholder="Type here…"
        />
      </ESurveyWrapper>
    </div>

    <!-- The declared data view: one row per survey.response event. -->
    <div>
      <h3 font-bold mb-2>Data view (<code>survey</code>)</h3>
      <table v-if="rows.length" text-sm b-1 b-gray-200 rounded w-full>
        <thead bg-gray-50>
          <tr><th p2 text-left>question</th><th p2 text-left>response</th><th p2 text-left>rt</th></tr>
        </thead>
        <tbody>
          <tr v-for="(row, i) in rows" :key="i" b-t b-gray-100>
            <td p2>{{ row.question }}</td>
            <td p2>{{ row.response }}</td>
            <td p2>{{ row.rt }}</td>
          </tr>
        </tbody>
      </table>
      <div v-else text-sm text-gray-400 italic>No responses yet.</div>
    </div>
  </div>
</template>
