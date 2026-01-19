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
  const { db } = useDatabase()
  const snapshot = await get(dbRef(db, fullPath))
  return snapshot.val()
}

const fetchSessionDataFromDb = async (mode: DataMode, sessionId: string): Promise<SessionData | null> => {
  const meta = await getDatabasePath<SessionMeta>(getDBPath(mode, sessionId, 'meta'))
  // if (!meta) return null
  const rawEvents = await getDatabasePath<DBSessionEvents>(getDBPath(mode, sessionId, 'events'))
  const other = await getDatabasePath<SafeDataObject>(getDBPath(mode, sessionId, 'other'))
  const events = decompressEvents(rawEvents ?? {})
  if (!meta || !meta.sessionId) {
    console.warn('⚠️ session meta has no sessionId', sessionId)
    // HACK: I don't know how this happens, but we may be able to patch with event data
    const db = useDatabase()
    const initEvent = events[0]
    if (initEvent?.eventType === 'DataWriter.initializeSession') {
      const patchedMeta = {
        ...meta,
        ...initEvent.data,
      } as SessionMeta
      assert(patchedMeta.sessionId === sessionId, 'patchedMeta.sessionId must match sessionId')
      await db.set(getDBPath(mode, sessionId, 'meta'), {...patchedMeta, _patchTime: Date.now()})
      console.log('  ✅ patched session meta', patchedMeta)
      return { meta: patchedMeta, events, other }
    }
    console.error('  ❌ could not patch session meta', {initEvent})
    // move this meta entry out of the main database
    await db.set(`/dev/brokenMetas/${sessionId}`, meta)
    await db.set(getDBPath(mode, sessionId, 'meta'), null)
    return null
    // END HACK
  }
  return { meta, events, other }
}

// LOCAL DATA ON FILE SYSTEM

type StoredSessionData = SessionData & { _downloadTime: number }
type StoredSessionMeta = SessionMeta & { _downloadTime: number }

export const writeLocalSessionData = async (session: SessionData, _downloadTime: number = Date.now()) => {
  console.debug('writing session data to filesystem', session.meta.sessionId)
  if (!session.meta.sessionId) {
    console.error('session meta has no sessionId', session.meta)
    return
  }
  const { mode, sessionId } = session.meta
  const fsData: StoredSessionData = {
    ...session,
    _downloadTime,
  }
  await $fetch(`/api/data/raw/${mode}/${sessionId}.json`, {
    method: 'PUT',
    body: fsData,
    timeout: 30000,
  })
  console.debug('  data written', session.meta.sessionId)

}

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
    console.log('syncing local data')
    // wait for last sync to complete before starting a new one
    await until(syncLoading).toBe(false)
    syncLoading.value = true
    
    try {
      // wait for db and fs meta to be ready
      await until(dbMeta).toBeTruthy();
      await until(fsMeta).toBeTruthy();
      const now = Date.now()
      const dbm = dbMeta.value!
      const fsm = fsMeta.value!

      let anyChanged = false
      // Process sessions with concurrency limit to avoid overwhelming the backend
      const sessionIds = Object.keys(dbm)
      const concurrencyLimit = 1
      for (let i = 0; i < sessionIds.length; i += concurrencyLimit) {
        const batch = sessionIds.slice(i, i + concurrencyLimit)
        await Promise.all(batch.map(async (sessionId) => {
          // skip if session has been downloaded after the last update
          const dlTime = (fsm[sessionId]?._downloadTime || 0)
          if (dlTime >= dbm[sessionId].lastUpdateTime) {
            return
          }
          console.debug('fetching session data', sessionId)
          const sessionData = await fetchSessionDataFromDb(mode, sessionId)
          if (!sessionData) {
            console.error('session data not found', sessionId)
            return
          }
          if (!sessionData.meta.sessionId) {
            console.error('sessionData.meta has no sessionId', sessionId, sessionData.meta,)
            return
          }
          // local data is stale -> update it
          anyChanged = true
          await writeLocalSessionData(sessionData, now)
          console.debug(`  done (${sessionId})`)
          fsm[sessionId] = {
            ...dbm[sessionId],
            _downloadTime: now,
          }
        }))
      }
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

