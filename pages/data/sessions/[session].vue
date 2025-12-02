<script setup lang="ts">
import '~/preprocessing'

definePageMeta({
  layout: 'dashboard',
})

const route = useRoute()
const sessionId = route.params.session as string
const mode = (route.query.mode as 'live' | 'debug') || 'live'


const { data, downloadTime, meta, status } = useSessionData(mode, sessionId)

const eventList = computed(() => {
  if (!data.value) return []
  
  return makeEventList(data.value)
})

const dataViews = useDataViews()

const processedData = computed(() => {
  const dv = data.value
  if (!dv) return null
  return R.mapValues(dataViews, fn => {
    try {
      const result = fn(dv)
      return { success: true, data: result }
    } catch (error) {
      return { success: false, error }
    }
  })
})

</script>

<template>
  <div class="p-8 max-w-7xl mx-auto">
    <!-- <Error :error="metaError || sessionError" /> -->

    <NuxtLink :to="`/data/sessions?mode=${mode}`" class="absolute translate-y--5 translate-x-1"> ← All Sessions </NuxtLink>
    
    <div v-if="meta" class="mb-6">
      <div class="bg-gray-100 p-6 rounded mb-6 relative">
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
          <div><b>Participant ID:</b> <span class="font-mono text-xs">{{ meta.participantId || 'N/A' }}</span></div>
          <div><b>Study ID:</b> <span class="font-mono text-xs">{{ meta.studyId || 'N/A' }}</span></div>
          <div><b>Version:</b> {{ meta.version || 'N/A' }}</div>
          <div><b>Mode:</b> {{ meta.mode || 'N/A' }}</div>
          <div><b>Start Time:</b> {{ formatDateTime(meta.startTime) }}</div>
          <div><b>Last Update:</b> {{ formatDateTime(meta.lastUpdateTime) }}</div>
          <div><b>Last Download:</b> {{ formatDateTime(downloadTime) }}</div>
          <div><b>Bonus:</b> ${{ (meta.bonus || 0).toFixed(2) }}</div>
        </div>
      </div>

      <!-- <div v-if="sessionData">
        <div class="mb-4">
          <h3 class="text-lg font-semibold mb-2">Session Data</h3>
        </div>
        <pre class="bg-gray-100 p-4 rounded overflow-auto max-h-96 text-xs">{{ JSON.stringify(sessionData, null, 2) }}</pre>
      </div> -->

      <TabContainer id=session-tabs :default-tab="0">
        <Tab title="events">
          <DataTable v-if="eventList" :data="eventList" placeholder="e.g. key:SPACE !instructions" />
        </Tab>

        <Tab v-for="(val, name) in processedData" :key="String(name)" :title="String(name)">
          <Error v-if="val && !val.success" :error="val.error" />
          <DataTable v-else-if="val && val.success && val.data" :data="val.data" />
        </Tab>

        <Tab title="meta">
          <pre class="bg-gray-100 p-4 rounded overflow-auto max-h-96 text-xs">{{ JSON.stringify(meta, null, 2) }}</pre>
        </Tab>

      </TabContainer>
    </div>
  </div>
</template>
