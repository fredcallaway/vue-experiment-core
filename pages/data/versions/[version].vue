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
  const bonuses = mySessions.value
    .filter(session => sessionStatus(session) === 'completed')
    .map(session => session.bonus)
  return calcStats(bonuses)
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
    .filter(session => sessionStatus(session) === 'completed')
    .map(session => assertNumber(session.completionTime) - session.startTime)
  return calcStats(durations)
})

const activeTimeStats = computed(() => {
  const durations = mySessions.value
    .filter(session => sessionStatus(session) === 'completed')
    .map(session => getSessionTimeInfo(session).activeMs)
    .filter((x): x is number => x !== null)
  return calcStats(durations)
})

const errorStats = computed(() => {
  const sessionErrors = mySessions.value.filter(session => session.error).length
  const eventErrors = mySessionData.value
    ? R.sum(mySessionData.value.map(session => session.events.filter(isErrorEvent).length))
    : 0
  return { sessionErrors, eventErrors }
})

const overallStatusCounts = computed(() => {
  const sessions = mySessions.value
  if (sessions.length === 0) return null
  const raw = R.countBy(sessions, sessionStatus)
  return {
    active: raw.active ?? 0,
    completed: raw.completed ?? 0,
    idle: raw.idle ?? 0,
    quit: raw.quit ?? 0,
    error: raw.error ?? 0,
    total: sessions.length,
  }
})

const completedByCondition = computed(() => {
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
      const completed = group.filter(session => sessionStatus(session) === 'completed').length
      return { value, completed, total: group.length }
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
          <div v-if="mySessions.length === 0" class="text-gray-400">
            No sessions available
          </div>
          <div v-else class="flex flex-wrap gap-4">
            <div class="rounded border border-gray-200 bg-white p-4 min-w-72 flex-1">
              <h3 class="mb-3">Times</h3>
              <div class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 items-baseline">
                <div class="text-gray-400 fw400">Earliest Start:</div>
                <div>{{ formatDateTime(versionMeta.earliestStartTime) }}</div>
                <div class="text-gray-400 fw400">Latest Start:</div>
                <div>{{ formatDateTime(versionMeta.latestStartTime) }}</div>
                <div class="text-gray-400 fw400">Last Update:</div>
                <div>{{ formatDateTime(versionMeta.latestUpdateTime) }}</div>
              </div>
            </div>

            <div class="rounded border border-gray-200 bg-white p-4 min-w-72 flex-1">
              <h3 class="mb-3">Status Counts</h3>
              <div v-if="overallStatusCounts" class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 items-baseline">
                <div class="text-gray-400 fw400">Completed:</div>
                <div>{{ overallStatusCounts.completed }}</div>
                <div class="text-gray-400 fw400">Active:</div>
                <div>{{ overallStatusCounts.active }}</div>
                <div class="text-gray-400 fw400">Idle:</div>
                <div>{{ overallStatusCounts.idle }}</div>
                <div class="text-gray-400 fw400">Quit:</div>
                <div>{{ overallStatusCounts.quit }}</div>
                <div class="text-gray-400 fw400">Error:</div>
                <div>{{ overallStatusCounts.error }}</div>
                <div class="text-gray-400 fw400">Total:</div>
                <div>{{ overallStatusCounts.total }}</div>
              </div>
            </div>

            <div class="rounded border border-gray-200 bg-white p-4 min-w-72 flex-1">
              <h3 class="mb-3">Condition Counts (completed)</h3>
              <div v-if="completedByCondition.length === 0" class="text-gray-400">
                No conditions found
              </div>
              <div v-else class="grid grid-cols-1 gap-3">
                <div v-for="group in completedByCondition" :key="group.condition">
                  <div class="text-gray-400 fw400">{{ group.condition }}</div>
                  <div v-for="row in group.values" :key="row.value">
                    <span class="font-mono">{{ row.value }}</span> —
                    completed {{ row.completed }}
                    ({{ row.total }})
                  </div>
                </div>
              </div>
            </div>

            <div class="rounded border border-gray-200 bg-white p-4 min-w-72 flex-1">
              <h3 class="mb-3">Bonus</h3>
              <div v-if="bonusStats" class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 items-baseline">
                <div class="text-gray-400 fw400">Total:</div>
                <div>{{ formatDollars(bonusStats.total) }}</div>
                <div class="text-gray-400 fw400">Average:</div>
                <div>{{ formatDollars(bonusStats.avg) }}</div>
                <div class="text-gray-400 fw400">Median:</div>
                <div>{{ formatDollars(bonusStats.median) }}</div>
              </div>
              <div v-else class="text-gray-400">
                No bonus data available
              </div>
            </div>

            <div class="rounded border border-gray-200 bg-white p-4 min-w-72 flex-1">
              <h3 class="mb-3">Time Taken (completed)</h3>
              <div v-if="timeStats" class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 items-baseline">
                <div class="text-gray-400 fw400">Total Average:</div>
                <div>{{ formatTime(timeStats.avg) }}</div>
                <div class="text-gray-400 fw400">Total Median:</div>
                <div>{{ formatTime(timeStats.median) }}</div>
                <div class="text-gray-400 fw400">Active Average:</div>
                <div>{{ activeTimeStats ? formatTime(activeTimeStats.avg) : 'N/A' }}</div>
                <div class="text-gray-400 fw400">Active Median:</div>
                <div>{{ activeTimeStats ? formatTime(activeTimeStats.median) : 'N/A' }}</div>
              </div>
              <div v-else class="text-gray-400">
                No completed sessions
              </div>
            </div>

            <div class="rounded border border-gray-200 bg-white p-4 min-w-72 flex-1">
              <h3 class="mb-3">Errors</h3>
              <div class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 items-baseline">
                <div class="text-gray-400 fw400">Sessions with errors:</div>
                <div>{{ errorStats.sessionErrors }}</div>
                <div class="text-gray-400 fw400">Error events:</div>
                <div>{{ errorStats.eventErrors }}</div>
              </div>
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
          <div v-else class="text-gray-400">
            No session data available
          </div>
        </Tab>
      </TabContainer>
    </div>
  </div>
</template>
