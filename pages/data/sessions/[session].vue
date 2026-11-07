<script setup lang="ts">
import { useDataViews } from '../../../composables/dataViews'
import { exportAudioFiles } from '../../../internal/audio-file'
import { useProlificMessages } from '../../../internal/composables/useProlificMessages'
import { getSessionTimeInfo, makeEventList, readLocalSessionData, useSessionData } from '../../../internal/local-data'
import { formatDateTime, formatTime } from '../../../utils/formatting'
import * as R from 'remeda'

import '~/preprocessing'
import stringify from "json-stringify-pretty-compact";

definePageMeta({
  layout: 'dashboard',
})

const route = useRoute()
const sessionId = route.params.session as string
const mode = (route.query.mode as 'live' | 'debug') || 'live'


const { data, downloadTime, meta, status } = useSessionData(mode, sessionId)

const posthogId = computed(() => {
  const other = data.value?.other as any
  return other?.posthog?.sessionId ?? null
})

const posthogProjectId = useRuntimeConfig()?.public?.posthogProjectId

const posthogLink = computed(() => {
  const id = posthogId.value
  if (!posthogProjectId || !id) return null
  return `https://us.posthog.com/project/${posthogProjectId}/replay/home?sessionRecordingId=${id}`
})

const eventList = computed(() => {
  if (!data.value) return []
  
  return makeEventList(data.value)
})

const dataViews = useDataViews()
const saveError = ref<unknown>(null)
const saving = ref(false)
const lastSaveTime = ref<number | null>(null)
const processedDataPath = `data/processed/debug/${sessionId}/`

const saveSession = async () => {
  if (saving.value) return
  saving.value = true
  saveError.value = null
  try {
    const synced = await $fetch('/api/syncData', { method: 'POST', body: { mode, sessionId, includeAudio: true } })
    if (synced.numError > 0) throw new Error('Could not refresh this session. Retry before exporting.')
    const session = await readLocalSessionData(mode, sessionId)
    // Evaluate every view before writing so preprocessing errors cannot produce a partial export.
    const files = Object.entries(dataViews).map(([name, view]) => ({
      name: `${name}.${view.format}`, data: exportAudioFiles(view.fn(session), mode),
    }))
    files.push({ name: '_session.json', data: session })
    await Promise.all(files.map(file => $fetch(`/api/data/processed/debug/${encodeURIComponent(sessionId)}/${file.name}`, {
      method: 'POST', body: JSON.stringify(file.data),
      headers: { 'Content-Type': file.name.endsWith('.json') ? 'text/plain' : 'application/json' },
    })))
    lastSaveTime.value = Date.now()
  } catch (error) {
    saveError.value = error
  } finally {
    saving.value = false
  }
}

const processedData = computed(() => {
  const dv = data.value
  if (!dv) return null
  return R.mapValues(dataViews, view => {
    try {
      const result = view.fn(dv)
      return { success: true, format: view.format, data: result }
    } catch (error) {
      return { success: false, error, format: view.format }
    }
  })
})

const prolificMessages = useProlificMessages()
const correspondence = computed(() => {
  if (!meta.value?.studyId || !meta.value?.participantId) return null
  return prolificMessages.getOrCreateCorrespondence(meta.value.studyId, meta.value.participantId)
})

watchEffect(() => {
  console.log('correspondence', correspondence.value)
})

const timeInfo = computed(() => {
  if (!meta.value) return { totalMs: null, activeMs: null }
  return getSessionTimeInfo(meta.value)
})


</script>

<template>
  <div class="p-8 max-w-7xl mx-auto">
    <!-- <Error :error="metaError || sessionError" /> -->

    <NuxtLink :to="`/data/sessions?mode=${mode}`" class="absolute translate-y--5 translate-x-1"> ← All Sessions </NuxtLink>
    
    <div v-if="meta" class="mb-6">
      <div class="flex flex-row flex-gap-4 flex-justify-between w-full h-100">
        <div class="bg-gray-100 p-6 rounded-lg relative flex-1">
          <span
            v-if="status !== null"
            class="absolute text-3xl font-mono top-4 right-4 font-medium"
            :class="{
              'text-green-600': status === 'completed',
              'text-primary animate-pulse': status === 'active',
              'text-amber': status === 'idle',
              'text-red-600': status === 'quit',
            }"
          >
            {{  status }}
          </span>
          <h2 class="mb-4">Session <span class="font-mono">{{ sessionId }}</span></h2>
          <div class="grid grid-cols-1 gap-2">
            <!-- <div><b>Participant ID:</b> <span class="font-mono text-xs">{{ meta.participantId || 'N/A' }}</span></div> -->
            <!-- <div><b>Study ID:</b> <span class="font-mono text-xs">{{ meta.studyId || 'N/A' }}</span></div> -->
            <div v-if="mode === 'live' && meta.version">
              <b>Version: </b>
              <NuxtLink
                :to="`/data/versions/${meta.version}?mode=${mode}`"
              >
                {{ meta.version }}
              </NuxtLink>
            </div>
            <!-- <div><b>Mode:</b> {{ meta.mode || 'N/A' }}</div> -->
            <!-- <div><b>Last Download:</b> {{ formatDateTime(downloadTime) }}</div> -->
            <div><b>Start Time:</b> {{ formatDateTime(meta.startTime) }}</div>
            <div><b>Last Update:</b> {{ formatDateTime(meta.lastUpdateTime) }}</div>
            <div><b>Total Time:</b> {{ timeInfo.totalMs === null ? 'N/A' : formatTime(timeInfo.totalMs) }}</div>
            <div><b>Active Time:</b> {{ timeInfo.activeMs === null ? 'N/A' : formatTime(timeInfo.activeMs) }}</div>
            <div><b>Bonus:</b> ${{ (meta.bonus || 0).toFixed(2) }}</div>
            
            <NuxtLink v-if="posthogLink" :to="posthogLink" target="_blank">view replay on posthog</NuxtLink>
          </div>
        </div>
        <div class="flex-shrink-0" v-if="correspondence">
          <ProlificMessageBox :correspondence="correspondence" :show-study-link="true" :show-session-link="false" />
        </div>
      </div>

      <!-- <div v-if="sessionData">
        <div class="mb-4">
          <h3 class="text-lg font-semibold mb-2">Session Data</h3>
        </div>
        <pre class="bg-gray-100 p-4 rounded overflow-auto max-h-96 text-xs">{{ JSON.stringify(sessionData, null, 2) }}</pre>
      </div> -->

      <div v-if="mode === 'debug'" class="my-4 flex flex-wrap items-center gap-2">
        <b>Data:</b>
        <span class="font-mono">{{ processedDataPath }}</span>
        <span v-if="lastSaveTime">saved at {{ formatDateTime(lastSaveTime) }}</span>
        <button class="btn-blue-sm" :disabled="saving" @click="saveSession">{{ saving ? 'saving…' : 'save' }}</button>
      </div>
      <Error :error="saveError" />

      <TabContainer id=session-tabs :default-tab="0">
        <Tab title="events">
          <DataTable v-if="eventList" :data="eventList" placeholder="e.g. key:SPACE !instructions" />
        </Tab>

        <Tab v-for="(val, name) in processedData" :key="String(name)" :title="String(name)">
          <Error v-if="val && !val.success" :error="val.error" />
          <DataTable v-else-if="val && val.success && val.format === 'csv'"
            :data="(val.data as any)" :audio-sessions="data ? [data] : []" />
          <pre
            v-else-if="val && val.success && val.format === 'json'"
            class="bg-gray-100 p-4 rounded overflow-auto max-h-96 text-xs"
          >{{ stringify(val.data, { indent: 2 }) }}</pre>
        </Tab>

        <Tab title="meta">
          <pre class="bg-gray-100 p-4 rounded overflow-auto max-h-96 text-xs">{{ JSON.stringify(meta, null, 2) }}</pre>
        </Tab>

        <Tab title="audio">
          <RecordedAudio :sessions="data ? [data] : []" />
        </Tab>

      </TabContainer>
    </div>
  </div>
</template>
