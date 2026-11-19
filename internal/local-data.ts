import { useDatabase } from '../composables/useDatabase'
import { assertOneOf, assertString } from '../utils/asserts'
import * as R from 'remeda'
import {
  type DBSessionEvents,
  type DataMode,
  type SafeDataObject,
  type SessionData,
  type SessionMeta,
  decompressEvents,
  getDBPath,
} from './data'
import { isDefined, tryOnUnmounted, until } from '@vueuse/core'

import { ref as dbRef, onValue, get } from 'firebase/database'

// DATABASE 

export const useDatabasePath = <T>(
  path: string,
  listen: boolean,
  onError = (error: Error) => console.error(`Could not read Firebase path ${path}`, error),
) => {
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
    isMissing.value = !snapshot.exists()
    data.value = snapshot.val()
  }, onError, { onlyOnce: !listen })
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
    // if ( !isDefined(lastSyncTime.value) || !isDefined(lastUpdateTime.value) || syncLoading.value ) return 'loading'
    if ( syncLoading.value ) return 'loading'
    if ( !isDefined(lastSyncTime.value) || !isDefined(lastUpdateTime.value) ) return 'unknown'
    if (lastSyncTime.value < lastUpdateTime.value) return 'stale'
    return 'synced'
  })
  const syncLocalData = async (options: { includeAudio?: boolean; version?: string } = {}) => {
    // wait for last sync to complete before starting a new one
    await until(syncLoading).toBe(false)
    console.log('syncing local data')
    syncLoading.value = true
    
    try {
      const now = Date.now()
      const result = await $fetch(`/api/syncData`, {
        method: 'POST',
        body: { mode, ...options },
      })
      fsMeta.value = result.meta
      console.log(`synced ${result.numUpdated} local sessions in ${Date.now() - now}ms`)
      if (result.numError > 0) {
        console.warn(`error syncing ${result.numError} local sessions`)
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

export type SessionTimeInfo = {
  endTime: number | null
  totalMs: number | null
  inactiveMs: number | null
  activeMs: number | null
}

let nActiveTimeWarnings = 0
export const getSessionTimeInfo = (meta: SessionMeta): SessionTimeInfo => {
  const endTime = meta.completionTime ?? meta.lastUpdateTime
  const totalMs = endTime - meta.startTime

  if (!R.isDefined(meta.inactiveTime)) {
    return { endTime, totalMs, inactiveMs: null, activeMs: null }
  }

  const activeMs = totalMs - meta.inactiveTime
  if (activeMs < 0) {
    nActiveTimeWarnings++
    if (nActiveTimeWarnings < 10) {
      console.warn(`Active time is negative for session ${meta.sessionId}`, { totalMs, activeMs, inactiveMs: meta.inactiveTime })
    }
  }
  return { endTime, totalMs, inactiveMs: meta.inactiveTime, activeMs }
}

export const useSessionData = (mode: DataMode, sessionId: string) => {
  const databaseError = ref<Error | null>(null)
  const onError = (error: Error) => { databaseError.value = error }
  const { data: metaRef, isLoading: metaLoading } = useDatabasePath<SessionMeta>(
    getDBPath(mode, sessionId, 'meta'), true, onError,
  )
  const { data: eventsRef } = useDatabasePath<DBSessionEvents>(getDBPath(mode, sessionId, 'events'), true, onError)
  const { data: otherRef } = useDatabasePath<SafeDataObject>(getDBPath(mode, sessionId, 'other'), false, onError)

  const { data: fsData, error: fsError, status: fsStatus } = useFetch<StoredSessionData>(
    `/api/data/raw/${mode}/${encodeURIComponent(sessionId)}.json`, { query: { optional: true } },
  )
  const isLoading = computed(() => (metaLoading.value && !databaseError.value)
    || fsStatus.value === 'idle' || fsStatus.value === 'pending')

  const downloadTime = computed(() => fsData.value?._downloadTime ?? 0)

  const isSynced = computed(() => {
    if (fsError.value || (fsStatus.value === 'success' && !fsData.value)) return false
    if (!fsData.value || !metaRef.value) return null
    return downloadTime.value >= metaRef.value.lastUpdateTime
  })

  const dbData = computed<SessionData | null>(() => {
    if (!metaRef.value || databaseError.value) return null
    const meta = metaRef.value
    const events = decompressEvents(eventsRef.value ?? {})
    const other = otherRef.value ?? undefined
    return { meta, events, other }
  })

  const data = computed(() => dbData.value ?? fsData.value ?? null)
  const showingLocalCopy = computed(() => !dbData.value && !!fsData.value)
  const meta = computed<SessionMeta | null>(() => data.value?.meta ?? null)
  const status = computed(() => meta.value ? sessionStatus(meta.value) : null)

  return { downloadTime, meta, data, isSynced, status, isLoading, showingLocalCopy, databaseError, localError: fsError }
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
      activeDuration: getSessionTimeInfo(meta).activeMs,
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
        sessionId: session.meta.sessionId,
        time: event.timestamp,
        timeRaw: event.timestamp,
        epoch: currentEpoch,
        eventType: event.eventType,
        data: {},
        _rowInfo: rowInfo,
      }
    }
    return {
      sessionId: session.meta.sessionId,
      time: event.timestamp,
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
