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
const csvViews = computed(() => {
  return R.pipe(
    dataViews,
    R.entries(),
    R.filter(([_, view]) => view.format == 'csv'),
    R.fromEntries()
  )
})
const jsonViews = computed(() => {
  return R.pipe(
    dataViews,
    R.entries(),
    R.filter(([_, view]) => view.format == 'json'),
    R.fromEntries()
  )
})

const syncView = async (viewName: string) => {
  syncLoading.value[viewName] = true
  try {
    console.log('syncing view', viewName)
    const view = dataViews[viewName]
    if (!view) throw new Error(`View "${viewName}" not found`)
    const ext = view.format === 'csv' ? 'csv' : 'json'
    const body = view.format === 'csv'
      ? prepareCombinedData(view.fn)
      : prepareCombinedJson(view.fn)
    await $fetch(`/api/data/processed/${mode}/${version}/${viewName}.${ext}`, {
      method: 'POST',
      body,
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

const syncSessions = async () => {
  try {
    await $fetch(`/api/data/processed/${mode}/${version}/sessions.csv`, {
      method: 'POST',
      body: sessionList.value,
    })
    lastSyncTimes.value.sessions = Date.now()
    preprocessError.value = null
  } catch (error: any) {
    preprocessError.value = {
      message: 'Sync Failed: ' + (error?.data?.message || error?.message || 'Unknown error'),
      statusCode: error?.statusCode || error?.status,
      statusMessage: error?.statusMessage || error?.statusText || 'Unknown status',
      viewName: 'sessions',
    }
    console.error('Failed to sync sessions:', { error })
  }
}

const syncAllViews = async () => {
  await refreshMySessionData()
  if (syncError.value) {
    console.error('local data sync failed, skipping view sync', syncError.value)
  }
  await Promise.all([
    syncSessions(),
    ...Object.keys(csvViews.value).map(syncView),
    ...Object.keys(jsonViews.value).map(syncView),
  ])
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
  return Object.keys(csvViews.value).every(isViewSynced)
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
const prepareCombinedJson = (view: (sessionData: SessionData) => SafeData) => {
  if (!mySessionData.value) return []
  return R.mapToObj(mySessionData.value, sessionData => [
    sessionData.meta.sessionId,
    view(sessionData),
  ])
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

const calcStats = (values: number[]) => {
  if (values.length === 0) return null
  const sorted = R.sortBy(values, x => x)
  const total = R.sum(values)
  const avg = total / values.length
  const mid = Math.floor(values.length / 2)
  const median = values.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  return { total, avg, median, count: values.length }
}

const bonusStats = computed(() => {
  return calcStats(mySessions.value.map(session => session.bonus))
})

const studyIdsForVersion = computed(() => {
  if (!allSessions.value) return null
  const ids = R.unique(mySessions.value.map(session => session.studyId))
  if (ids.length === 0) throw new Error(`No studies found for version: ${version}`)
  return ids
})

const studyLabel = computed(() => {
  if (!studyIdsForVersion.value) return null
  return studyIdsForVersion.value.length === 1 ? 'Study' : 'Studies'
})

const timeStats = computed(() => {
  const durations = mySessions.value
    .filter(session => session.completionTime)
    .map(session => assertNumber(session.completionTime) - session.startTime)
  return calcStats(durations)
})

const errorStats = computed(() => {
  const sessionErrors = mySessions.value.filter(session => session.error).length
  const eventErrors = mySessionData.value
    ? R.sum(mySessionData.value.map(session => session.events.filter(isErrorEvent).length))
    : 0
  return { sessionErrors, eventErrors }
})

const conditionStatusCounts = computed(() => {
  const sessions = mySessions.value
  if (sessions.length === 0) return []
  const conditionKeys = R.unique(sessions.flatMap(session => Object.keys(session.conditions ?? {})))
  return conditionKeys.map((condition: string) => {
    const grouped = R.groupBy(sessions, session => {
      const conditions = session.conditions ?? {}
      const value = assertDefined(conditions[condition], `Missing condition "${condition}" for session ${session.sessionId}`)
      return String(value)
    })
    const values = Object.entries(grouped).map(([value, group]) => {
      const raw = R.countBy(group, sessionStatus)
      const counts = {
        active: raw.active ?? 0,
        completed: raw.completed ?? 0,
        idle: raw.idle ?? 0,
        quit: raw.quit ?? 0,
        error: raw.error ?? 0,
      }
      return { value, counts, total: group.length }
    })
    return { condition, values }
  })
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
          <div v-if="studyIdsForVersion">
            <b>{{ studyLabel }}: </b>
            <span
              v-for="(studyId, index) in studyIdsForVersion"
              :key="studyId"
            >
              <NuxtLink :to="`/prolific/${studyId}`">
                {{ studyId }}
              </NuxtLink>
              <span v-if="index < studyIdsForVersion.length - 1">, </span>
            </span>
          </div>
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
        <Tab title="overview">
          <div v-if="mySessions.length === 0" class="text-gray-500">
            No sessions available
          </div>
          <div v-else class="grid grid-cols-1 gap-6">
            <div>
              <h3 class="mb-2">Condition status counts</h3>
              <div v-if="conditionStatusCounts.length === 0" class="text-gray-500">
                No conditions found
              </div>
              <div v-else class="grid grid-cols-1 gap-3">
                <div v-for="group in conditionStatusCounts" :key="group.condition">
                  <div class="font-semibold">{{ group.condition }}</div>
                  <div v-for="row in group.values" :key="row.value">
                    <span class="font-mono">{{ row.value }}</span> —
                    completed {{ row.counts.completed }},
                    active {{ row.counts.active }},
                    idle {{ row.counts.idle }},
                    quit {{ row.counts.quit }},
                    error {{ row.counts.error }}
                    ({{ row.total }})
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h3 class="mb-2">Bonus</h3>
              <div v-if="bonusStats">
                <div><b>Total:</b> {{ formatCents(bonusStats.total) }}</div>
                <div><b>Average:</b> {{ formatCents(bonusStats.avg) }}</div>
                <div><b>Median:</b> {{ formatCents(bonusStats.median) }}</div>
              </div>
              <div v-else class="text-gray-500">
                No bonus data available
              </div>
            </div>

            <div>
              <h3 class="mb-2">Time taken (completed)</h3>
              <div v-if="timeStats">
                <div><b>Total:</b> {{ formatTime(timeStats.total) }}</div>
                <div><b>Average:</b> {{ formatTime(timeStats.avg) }}</div>
                <div><b>Median:</b> {{ formatTime(timeStats.median) }}</div>
                <div><b>Count:</b> {{ timeStats.count }}</div>
              </div>
              <div v-else class="text-gray-500">
                No completed sessions
              </div>
            </div>

            <div>
              <h3 class="mb-2">Errors</h3>
              <div><b>Sessions with errors:</b> {{ errorStats.sessionErrors }}</div>
              <div><b>Error events:</b> {{ errorStats.eventErrors }}</div>
            </div>
          </div>
        </Tab>
        <Tab title="sessions">
          <DataTable v-if="mySessions.length > 0" :data="sessionList" placeholder="e.g. active,complete 11/5" />
        </Tab>
        <Tab title="events">
          <DataTable v-if="eventList" :data="Object.values(eventList)" placeholder="e.g. key:SPACE !instructions" />
        </Tab>
        <Tab v-for="(view, key) in csvViews" :key="key" :title="key">
          <DataTable v-if="mySessionData" :data="prepareCombinedData(view.fn as any)" />
          <div v-else class="text-gray-500">
            No session data available
          </div>
        </Tab>
      </TabContainer>
    </div>
  </div>
</template>

