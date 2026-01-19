import { ref as dbRef, onValue, get } from 'firebase/database'

// DATABASE 

export const useDatabasePath = <T>(path: string, listen: boolean) => {
  // TODO track database listeners to avoid duplicates?
  console.debug('useDatabasePath.subscribe', path)
  const { db } = useDatabase()
  const data = ref(null) as Ref<T | null>
  const isLoading = ref<boolean>(true)
  const isMissing = ref<boolean>(false)
  const isReady = computed(() => !isLoading.value && !isMissing.value)
  const unsubscribe = onValue(dbRef(db, path), (snapshot) => {
    console.debug('useDatabasePath.snapshot', path, snapshot.val())
    isLoading.value = false
    if (!snapshot.exists()) {
      isMissing.value = true
    } else {
      isMissing.value = false
      data.value = snapshot.val()
    }
  }, { onlyOnce: !listen })
  tryOnUnmounted(() => {
    console.debug('useDatabasePath.unsubscribe', path)
    unsubscribe()
  })
  return { data, unsubscribe, isLoading, isMissing, isReady }
}

export const getDatabasePath = async <T>(fullPath: string): Promise<T | null> => {
  const now = Date.now()
  const { db } = useDatabase()
  const snapshot = await get(dbRef(db, fullPath))
  console.log(`getDatabasePath(${fullPath}) took ${Date.now() - now}ms`)
  return snapshot.val()
}

// LOCAL DATA ON FILE SYSTEM

type StoredSessionData = SessionData & { _downloadTime: number }
type StoredSessionMeta = SessionMeta & { _downloadTime: number }

export const readLocalSessionData = (mode: DataMode, sessionId: string): Promise<StoredSessionData> => {
  return $fetch<StoredSessionData>(`/api/data/raw/${mode}/${sessionId}.json`)
}

// MAIN COMPOSABLES

export const useAllData = (mode: DataMode, listen: boolean = true) => {
  assertOneOf(mode, ['live', 'debug'])

  const { data: fsMeta } = useFetch<Record<string, StoredSessionMeta>>(`/api/data/raw/${mode}/_meta.json`, {
    query: { default: '{}' }
  })
  const { data: dbMeta, isMissing, isLoading } = useDatabasePath<Record<string, SessionMeta>>(`${mode}/meta`, listen)
  const sessions = computed(() => dbMeta.value) // TODO use fsMeta if offline ?


  const lastSyncTime = computed(() => {
    if (!fsMeta.value) return null
    return Math.max(...Object.values(fsMeta.value).map(fsm => fsm._downloadTime || 0))
  })

  const lastUpdateTime = computed(() => {
    if (!dbMeta.value) return null
    return Math.max(...Object.values(dbMeta.value).map(dbm => dbm.lastUpdateTime || 0))
  })

  const syncLoading = ref(false)
  const syncStatus = computed(() => {
    if ( !isDefined(lastSyncTime.value) || !isDefined(lastUpdateTime.value) || syncLoading.value ) return 'loading'
    if (lastSyncTime.value < lastUpdateTime.value) return 'stale'
    return 'synced'
  })
  const syncLocalData = async () => {
    // wait for last sync to complete before starting a new one
    await until(syncLoading).toBe(false)
    console.log('syncing local data')
    syncLoading.value = true
    
    try {
      const now = Date.now()
      const result = await $fetch(`/api/syncData`, {
        method: 'POST',
        body: { mode },
      })
      fsMeta.value = result.meta
      console.log(`synced ${result.numUpdated} local sessions in ${Date.now() - now}ms`)
    } catch (error) {
      console.error('error syncing local data', error)
      throw error
    } finally {
      syncLoading.value = false
    }
  }

  return { sessions, syncLocalData, syncStatus, lastSyncTime, lastUpdateTime, isMissing, isLoading }
}

export type SessionStatus = 'active' | 'completed' | 'idle' | 'quit' | 'error'

export const sessionStatus = (meta: SessionMeta): SessionStatus => {
  if (meta.error) return 'error'
  if (meta.completionTime) return 'completed'
  const minutesSinceUpdate = (Date.now() - meta.lastUpdateTime) / 60000
  if (minutesSinceUpdate < 1) return 'active'
  if (minutesSinceUpdate < 30) return 'idle'
  return 'quit' // TODO: check if they actually left the page?
}

type ReactiveSession = {
  downloadTime: ComputedRef<number>
  meta: ComputedRef<SessionMeta | null>
  data: ComputedRef<SessionData | null>
  isSynced: ComputedRef<boolean | null>
  status: ComputedRef<SessionStatus | null>
}

export const useSessionEvents = (mode: DataMode, sessionId: string) => {
  const { data, ...rest } = useDatabasePath<DBSessionEvents | null>(getDBPath(mode, sessionId, 'events'), true)
  const events = computed(() => decompressEvents(data.value ?? {}))
  return { events, ...rest }
}

export const useSessionMeta = (mode: DataMode, sessionId: string) => {
  const { data, ...rest } = useDatabasePath<SessionMeta | null>(getDBPath(mode, sessionId, 'meta'), true)
  return { meta: data, ...rest }
}

export const useSessionData = (mode: DataMode, sessionId: string): ReactiveSession => {
  const { data: metaRef } = useDatabasePath<SessionMeta | null>(getDBPath(mode, sessionId, 'meta'), true)
  const { data: eventsRef } = useDatabasePath<DBSessionEvents | null>(getDBPath(mode, sessionId, 'events'), true)
  const { data: otherRef } = useDatabasePath<SafeDataObject | null>(getDBPath(mode, sessionId, 'other'), false)

  const { data: fsData, error: fsError } = useFetch<StoredSessionData>(`/api/data/raw/${mode}/${sessionId}.json`)

  const downloadTime = computed(() => fsData.value?._downloadTime ?? 0)

  const isSynced = computed(() => {
    if (fsError.value) return false
    if (!fsData.value || !metaRef.value) return null
    return downloadTime.value >= metaRef.value.lastUpdateTime
  })

  const dbData = computed<SessionData | null>(() => {
    if (!metaRef.value) return null
    const meta = metaRef.value
    const events = decompressEvents(eventsRef.value ?? {})
    const other = otherRef.value ?? undefined
    return { meta, events, other }
  })

  const data = computed<SessionData | null>(() => {
    if (dbData.value) return dbData.value
    return fsData.value
  })

  const meta = computed<SessionMeta | null>(() => data.value?.meta ?? metaRef.value ?? null)
  const status = computed(() => meta.value ? sessionStatus(meta.value) : null)

  return { downloadTime, meta, data, isSynced, status }
}

// utilities
export const makeSessionList = (sessions: Record<string, SessionMeta> | SessionMeta[]) => {
  return R.pipe(
    Object.values(sessions),
    R.sortBy(meta => -(meta.startTime || 0)),
    R.map(meta => ({
      sessionId: meta.sessionId,
      version: meta.version,
      ...(meta.conditions ?? {}),
      status: sessionStatus(meta),
      bonus: meta.bonus,
      startTime: meta.startTime,
      noReturnTime: meta.noReturnTime,
      completionTime: meta.completionTime,
      lastUpdateTime: meta.lastUpdateTime,
      participantId: meta.participantId,
      assignment: meta.assignment,
      studyId: meta.studyId,
    })),
  )
}

export const makeEventList = (session: SessionData) => {
  let currentEpoch = ''
  const rowInfo = {
    sessionId: session.meta.sessionId,
    mode: session.meta.mode,
  }
  return session.events.map(event => {
    const payload = event.data ?? {}
    if (event.eventType.startsWith('epoch.start')) {
      // currentEpoch = typeof payload.id === 'string' ? payload.id as string : currentEpoch
      currentEpoch = assertString(payload.id)
      return {
        time: event.timestamp,
        epoch: currentEpoch,
        eventType: event.eventType,
        data: {},
        _rowInfo: rowInfo,
      }
    }
    return {
      sessionId: session.meta.sessionId,
      timeRaw: event.timestamp,
      epoch: currentEpoch,
      eventType: event.eventType,
      data: payload,
      _rowInfo: rowInfo,
    }
  })
}

const statusCounts = (sessions: SessionMeta[]) => {
  return {
    'completed': 0,
    'active': 0,
    'idle': 0,
    'quit': 0,
    ...R.countBy(sessions, sessionStatus),
  }
}

export const makeVersionInfo = (sessions: SessionMeta[]) => {
  return {
    ...statusCounts(sessions),
    earliestStartTime: Math.min(...sessions.map(session => session.startTime)),
    latestStartTime: Math.max(...sessions.map(session => session.startTime)),
    latestUpdateTime: Math.max(...sessions.map(session => session.lastUpdateTime)),
  }
}

