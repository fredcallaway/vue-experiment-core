import { ref as dbRef, onValue, get } from 'firebase/database'

// DATABASE 

export const useDatabasePath = <T>(path: string, listen: boolean) => {
  // TODO track database listeners to avoid duplicates?
  console.debug('useDatabasePath.subscribe', path)
  const db = useDatabase()
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
  const db = useDatabase()
  const snapshot = await get(dbRef(db, fullPath))
  return snapshot.val()
}

const fetchSessionDataFromDb = async (mode: DataMode, sessionId: string): Promise<SessionData | null> => {
  const meta = await getDatabasePath<SessionMeta>(getDBPath(mode, sessionId, 'meta'))
  if (!meta) return null
  const rawEvents = await getDatabasePath<DBSessionEvents>(getDBPath(mode, sessionId, 'events'))
  const other = await getDatabasePath<Record<string, unknown>>(getDBPath(mode, sessionId, 'other'))
  const events = decompressEvents(rawEvents ?? {})
  return { meta, events, other }
}

// LOCAL DATA ON FILE SYSTEM

type StoredSessionData = SessionData & { _downloadTime: number }
type StoredSessionMeta = SessionMeta & { _downloadTime: number }

export const writeLocalSessionData = async (session: SessionData, _downloadTime: number = Date.now()) => {
  console.debug('writing session data to filesystem', session.meta.sessionId)
  const { mode, sessionId } = session.meta
  const fsData: StoredSessionData = {
    ...session,
    _downloadTime,
  }
  await $fetch(`/api/data/raw/${mode}/${sessionId}.json`, {
    method: 'PUT',
    body: fsData,
  })
}

export const readLocalSessionData = (mode: DataMode, sessionId: string): Promise<StoredSessionData> => {
  return $fetch<StoredSessionData>(`/api/data/raw/${mode}/${sessionId}.json`)
}

// MAIN COMPOSABLES

export const useAllData = (mode: DataMode, listen: boolean = true) => {

  const { data: fsMeta } = useFetch<Record<string, StoredSessionMeta>>(`/api/data/raw/${mode}/_meta.json`, {
    query: { default: '{}' }
  })
  const { data: dbMeta } = useDatabasePath<Record<string, SessionMeta>>(`${mode}/meta`, listen)
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
    console.log('syncing local data')
    // wait for last sync to complete before starting a new one
    await until(syncLoading).toBe(false)
    
    // wait for db and fs meta to be ready
    await until(dbMeta).toBeTruthy();
    await until(fsMeta).toBeTruthy();
    const now = Date.now()
    const dbm = dbMeta.value!
    const fsm = fsMeta.value!

    let anyChanged = false
    await Promise.all(Object.keys(dbm).map(async (sessionId) => {
      // skip if session has been downloaded after the last update
      const dlTime = (fsm[sessionId]?._downloadTime || 0)
      if (dlTime >= dbm[sessionId].lastUpdateTime) {
        return
      }
      // local data is stale -> update it
      anyChanged = true
      const sessionData = await fetchSessionDataFromDb(mode, sessionId)
      if (!sessionData) {
        console.error('session data not found', sessionId)
        return
      }
      await writeLocalSessionData(sessionData, now)
      fsm[sessionId] = {
        ...dbm[sessionId],
        _downloadTime: now,
      }
    }))
    // update fs meta if any changes were made
    if (anyChanged) {
      await $fetch(`/api/data/raw/${mode}/_meta.json`, {
        method: 'PUT',
        body: fsm,
      })
      fsMeta.value = fsm
      console.log('synced local data', fsm)
    } else {
      console.log('no changes to local data')
    }
  }

  return { sessions, syncLocalData, syncStatus, lastSyncTime, lastUpdateTime }
}

export type SessionStatus = 'active' | 'completed' | 'idle' | 'quit'

export const sessionStatus = (meta: SessionMeta): SessionStatus => {
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

export const useSessionData = (mode: DataMode, sessionId: string): ReactiveSession => {
  const { data: metaRef } = useDatabasePath<SessionMeta | null>(getDBPath(mode, sessionId, 'meta'), true)
  const { data: eventsRef } = useDatabasePath<DBSessionEvents | null>(getDBPath(mode, sessionId, 'events'), true)
  const { data: otherRef } = useDatabasePath<Record<string, unknown> | null>(getDBPath(mode, sessionId, 'other'), false)

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
      ...meta,
      status: sessionStatus(meta),
    })),
    R.map(R.pick([
      'sessionId',
      'version',
      'status',
      'startTime',
      'lastUpdateTime',
      'participantId',
      'studyId',
    ])),
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
      currentEpoch = typeof (payload as Record<string, unknown>).id === 'string'
        ? (payload as Record<string, unknown>).id as string
        : currentEpoch
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
      time: event.timestamp,
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

