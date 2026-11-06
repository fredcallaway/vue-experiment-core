<script lang="ts">
import { declareDataView, declareDataViewJson } from '../../../../composables/dataViews'
import type { SessionData } from '../../../../internal/data'

const responses = (session: SessionData) => {
  const clearedAt = session.events.findLast(event => event.eventType === 'trial.clear')?.index ?? -1
  return session.events.filter(event => event.eventType === 'trial.response' && event.index > clearedAt).map(event => ({
    ...event.data,
    audio_path: session.events.findLast(event => event.eventType === 'file.saved')?.data.path ?? null,
  }))
}
declareDataView('instructions', session => session.events.filter(event => event.eventType === 'instructions.response')
  .map(event => event.data))
declareDataView('trials', responses)
declareDataViewJson('details', session => ({ rows: responses(session), notes: session.events
  .filter(event => event.eventType === 'detail.note').map(event => event.data) }))
declareDataView('survey', session => session.events.filter(event => event.eventType === 'survey.submit')
  .map(event => event.data))
declareDataView('broken', session => {
  if (session.events.some(event => event.eventType === 'transform.fail')) throw new Error('Synthetic transform failure')
  return []
})
declareDataViewJson('metadata', session => ({ bonus: session.meta.bonus }))
</script>

<script setup lang="ts">
import { logEvent } from '../../../../composables/logEvent'
import { useCurrentSession } from '../../../../composables/useCurrentSession'

let response = 0
const addNameMatches = () => {
  declareDataView('experiment', session => [{ events: session.events.length }])
  declareDataView('trial', responses)
}
</script>

<template>
  <ESequence name="experiment" class="p6 flex flex-col gap4">
    <EPage name="trial" v-slot="{ done }">
      <h1>Data preview fixture</h1>
      <div class="flex flex-wrap gap2">
        <button @click="logEvent('instructions.response', { response: 'left' })">Log instructions</button>
        <button @click="logEvent('trial.response', { response: ++response, correct: true })">Log response</button>
        <button @click="logEvent('file.saved', { path: `clip-${response}.webm` })">Save recording</button>
        <button @click="logEvent('detail.note', { note: 'JSON only' })">Update JSON</button>
        <button @click="logEvent('participant.hover')">Log unrelated event</button>
        <button @click="logEvent('trial.clear')">Clear rows</button>
        <button @click="logEvent('transform.fail')">Fail transform</button>
        <button @click="useCurrentSession().bonus++">Update metadata</button>
        <button @click="addNameMatches">Add ancestor and trial views</button>
        <button @click="done()">Enter survey</button>
      </div>
    </EPage>
    <EPage name="Survey" v-slot="{ done }">
      <h1>Survey fixture</h1>
      <button @click="logEvent('survey.submit', { fun: 5 })">Submit survey</button>
      <button @click="done()">Finish fixture</button>
    </EPage>
    <EPage name="completion">Fixture complete</EPage>
  </ESequence>
</template>
