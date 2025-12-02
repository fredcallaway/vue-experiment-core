<script setup lang="ts">
import '~/preprocessing'

definePageMeta({
  layout: 'dashboard',
})

const route = useRoute()
const version = route.params.version as string
const mode = (route.query.mode as 'live' | 'debug') || 'live'

const { sessions: allSessions, syncStatus, syncLocalData, lastUpdateTime } = useAllData(mode)

const mySessions = computed(() => {
  if (!allSessions.value) return []
  return Object.entries(allSessions.value)
    .filter(([_, sessionMeta]) => sessionMeta.version === version)
    .map(([key, val]) => val)
})

const mySessionIds = computed(() => {
  return mySessions.value.map(session => session.sessionId)
})

const syncError = ref<any>(null)
const lastLoadTime = ref(0)
const { state: mySessionData, execute: refreshMySessionData, isLoading: sessionsLoading } = useAsyncState<SessionData[]>(async () => {
  console.log('loading session data')
  syncError.value = null
  await until(mySessionIds).toMatch(x => x.length > 0)
  await syncLocalData()
  // NOTE: we write to FS then read from it; this could be avoided
  
  const sessionIds = mySessions.value.map(session => session.sessionId)
  if (sessionIds.length === 0) return []
  
  const result: Record<string, SessionData> = {}
  await Promise.all(
    sessionIds.map(async (sessionId) => {
      try {
        const data = await readLocalSessionData(mode, sessionId)
        result[sessionId] = data
      } catch (error) {
        console.error(`Failed to fetch session ${sessionId}:`, error)
        syncError.value = error
      }
    })
  )
  console.log('mySessions.result', result)
  lastLoadTime.value = Date.now()
  return Object.values(result)
}, [])

const versionMeta = computed(() => {
  if (!mySessionData.value) return null

  return makeVersionInfo(mySessions.value)
})


const syncLoading = ref<Record<string, boolean>>({})
const lastSyncTimes = useLocalStorage<Record<string, number | null>>(`lastSyncTimes-${mode}-${version}`, {})

const preprocessError = ref<any>(null)

const dataViews = useDataViews()

const syncView = async (viewName: string) => {
  syncLoading.value[viewName] = true
  try {
    const view = dataViews[viewName]
    if (!view) throw new Error(`View "${viewName}" not found`)
    
    const rows = prepareCombinedData(view)
    await $fetch(`/api/data/processed/${mode}/${version}/${viewName}.csv`, { 
      method: 'POST',
      body: rows
    })
    lastSyncTimes.value[viewName] = Date.now()
    preprocessError.value = null
  } catch (error: any) {
    preprocessError.value = {
      message: 'Sync Failed: ' +(error?.data?.message || error?.message || 'Unknown error'),
      statusCode: error?.statusCode || error?.status,
      statusMessage: error?.statusMessage || error?.statusText || 'Unknown status',
      viewName,
    }
    console.error(`Failed to sync view ${viewName}:`, {error})
  } finally {
    syncLoading.value[viewName] = false
  }
}

const syncAllViews = async () => {
  await refreshMySessionData()
  if (syncError.value) {
    console.error('local data sync failed, skipping view sync', syncError.value)
  }
  await Promise.all(Object.keys(dataViews).map(syncView))
}

const isViewSynced = (viewName: string) => {
  const lastSyncTime = lastSyncTimes.value[viewName]
  if (!lastSyncTime) return false
  
  if (!versionMeta.value?.latestUpdateTime) return true
  
  return lastSyncTime >= versionMeta.value.latestUpdateTime
}

const allViewsSynced = computed(() => {
  // TODO: need some kind of hash checking because preprocessing code could have changed
  return false
  if (!versionMeta.value?.latestUpdateTime) return false
  return Object.keys(dataViews).every(isViewSynced)
})

const lastSyncTime = computed(() => {
  const times = Object.values(lastSyncTimes.value).filter(Boolean) as number[]
  return times.length > 0 ? Math.max(...times) : null
})

const prepareCombinedData = (view: (sessionData: SessionData) => object[] ) => {
  if (!mySessionData.value) return []
  return R.pipe(
    mySessionData.value,
    R.flatMap(sessionData => view(sessionData).map(x => ({session_id: sessionData.meta.sessionId, ...x})))
  )
}

const eventList = computed(() => {
  if (!mySessionData.value) return []
  return R.flatMap(mySessionData.value, makeEventList)
})

const sessionList = computed(() => {
  if (!mySessions.value) return []
  return makeSessionList(mySessions.value).map(R.omit(['version']))
})

const error = computed(() => {
  return syncError.value || preprocessError.value
})


</script>

<template>
  <div class="p-8 max-w-7xl mx-auto">
    <!-- <Error :error="metaError" /> -->

    <NuxtLink :to="`/data/versions?mode=${mode}`" class="absolute translate-y--5 translate-x-1"> ← All Versions </NuxtLink>

    <div v-if="versionMeta" class="mb-6">
      <div class="bg-gray-100 p-6 rounded mb-6">
        <h2 class="mb-4">Version <span class="font-mono">{{ version }}</span></h2>
        <div class="grid grid-cols-1 gap-2">
          <!-- <div><b>Session Count:</b> {{ versionMeta.sessionCount }}</div> -->
          <div><b>Earliest Start:</b> {{ formatDateTime(versionMeta.earliestStartTime) }}</div>
          <div><b>Latest Start:</b> {{ formatDateTime(versionMeta.latestStartTime) }}</div>
          <div><b>Latest Update:</b> {{ formatDateTime(versionMeta.latestUpdateTime) }}</div>
          <!-- <div><b>Total Bonus:</b> ${{ versionMeta.totalBonus.toFixed(2) }}</div> -->
          <!-- <div><b>Average Bonus:</b> ${{ versionMeta.averageBonus.toFixed(2) }}</div> -->
        </div>
        <div min-h-6 flex items-center mt-4>
          <span class="font-mono">data/processed/{{ mode }}/{{ version }}/</span>&nbsp;
          <span v-if="allViewsSynced"> is up to date</span>
          <span v-else>
            was last synchronized at 
            <RefreshButton
              :refresh="syncAllViews"
              :is-loading="sessionsLoading"
              :timestamp="lastSyncTime"
              label=""
            />
          </span>
        </div>
      </div>

      <Error :error="error" />

      <!-- <div v-if="mySessionData.length > 0" class="mb-4">
        <h3 class="text-lg font-semibold mb-2">Sessions ({{ mySessionData.length }})</h3>
        <div class="flex flex-wrap gap-2">
          <NuxtLink
            v-for="sessionId in mySessionData"
            :key="sessionId"
            :to="`/data/${sessionId}?mode=${mode}`"
            class="px-3 py-1 bg-blue-100 hover:bg-blue-200 rounded text-sm font-mono"
          >
            {{ sessionId }}
          </NuxtLink>
        </div>
      </div> -->

      <TabContainer :default-tab="0" id="version-tabs">
        <Tab title="sessions">
          <DataTable v-if="mySessions.length > 0" :data="sessionList" placeholder="e.g. active,complete 11/5" />
        </Tab>
        <Tab title="events">
          <DataTable v-if="eventList" :data="Object.values(eventList)" placeholder="e.g. key:SPACE !instructions" />
        </Tab>
        <Tab v-for="(view, key) in dataViews" :key="key" :title="key">
          <DataTable v-if="mySessionData" :data="prepareCombinedData(view)" />
          <div v-else class="text-gray-500">
            No session data available
          </div>
        </Tab>
      </TabContainer>
    </div>
  </div>
</template>

