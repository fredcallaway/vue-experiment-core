import { readFile as readFileAsync, writeFile as writeFileAsync, mkdir, readdir } from 'fs/promises'
import { existsSync } from 'fs'
import { dirname, resolve } from 'path'
import firebaseConfig from '~/firebase.config.json'
import { decompressEvents, getDBPath, type DataMode, type DBSessionEvents, type SafeDataObject, type SessionData, type SessionMeta } from '~/core/internal/data'
import { assert } from '~/core/utils/asserts'

type StoredSessionData = SessionData & { _downloadTime: number }
type StoredSessionMeta = SessionMeta & { _downloadTime: number }

const DATA_DIR = resolve(process.cwd(), 'data')
const RAW_DIR = resolve(DATA_DIR, 'raw')
const DATABASE_URL = firebaseConfig.databaseURL.replace(/\/$/, '')

const readJsonFile = async <T>(filePath: string, defaultValue: T): Promise<T> => {
  if (!existsSync(filePath)) return defaultValue
  const content = await readFileAsync(filePath, 'utf-8')
  return JSON.parse(content)
}

const writeJsonFile = async (filePath: string, content: unknown) => {
  const dirPath = dirname(filePath)
  if (!existsSync(dirPath)) {
    await mkdir(dirPath, { recursive: true })
  }
  await writeFileAsync(filePath, JSON.stringify(content), 'utf-8')
}

const getDatabasePath = async <T>(fullPath: string): Promise<T | null> => {
  const url = `${DATABASE_URL}/${fullPath}.json`
  return await $fetch<T | null>(url)
}

const setDatabasePath = async (fullPath: string, value: null | object) => {
  const url = `${DATABASE_URL}/${fullPath}.json`
  if (value === null) {
    await $fetch(url, { method: 'DELETE' })
    return
  }
  await $fetch(url, { method: 'PUT', body: value })
}


const fetchSessionDataFromDb = async (mode: DataMode, sessionId: string, meta: SessionMeta): Promise<SessionData | null> => {
  if (!sessionId) {
    console.error('⚠️ sessionId is missing', {sessionId, meta})
    return null
  } else if (meta.sessionId && sessionId !== meta.sessionId) {
    console.error('⚠️ sessionId mismatch', {sessionId, meta})
    return null
  }
  const rawEvents = await getDatabasePath<DBSessionEvents>(getDBPath(mode, sessionId, 'events'))
  const events = decompressEvents(rawEvents ?? {})
  const other = await getDatabasePath<SafeDataObject>(getDBPath(mode, sessionId, 'other'))

  if (!meta.sessionId) {
    // this occasionally happens when people leave very quickly
    const veryShort = (
      events.length < 2 ||
      events[events.length - 1]!.timestamp - events[0]!.timestamp < 10_000
    )
    if (veryShort) {
      console.warn('removing incomplete (very short) session from database', { sessionId, meta })
      await setDatabasePath(`dev/brokenMetas/${sessionId}`, meta)
      assert(!!mode && !!sessionId, 'CANNOT UPDATE DATABASE')
      console.info('\n\n***', getDBPath(mode, sessionId, 'meta'), '\n\n')
      await setDatabasePath(getDBPath(mode, sessionId, 'meta'), null)
    } else {
      console.error('⚠️ session has no sessionId', { sessionId, meta })
    }
    return null
  }
  return { meta, events, other }
}

const writeLocalSessionData = async (mode: DataMode, session: SessionData, _downloadTime: number) => {
  if (!session.meta.sessionId) {
    throw new Error('session meta has no sessionId')
  }
  const fsData: StoredSessionData = {
    ...session,
    _downloadTime,
  }
  const filePath = resolve(RAW_DIR, mode, `${session.meta.sessionId}.json`)
  await writeJsonFile(filePath, fsData)
}

let syncRunning = false

const getFsMeta = async (mode: DataMode) => {
  const fsMetaPath = resolve(RAW_DIR, mode, '_meta.json')
  const fsMeta = await readJsonFile<Record<string, StoredSessionMeta>>(fsMetaPath, {})
  // fsMeta can get de-synchronized; we patch entries without a valid downloadTime
  const rawDir = resolve(RAW_DIR, mode)
  if (!existsSync(rawDir)) return { fsMeta, fsMetaPath }
  const entries = await readdir(rawDir)
  const sessionFiles = entries.filter(name => name.endsWith('.json') && name !== '_meta.json')
  let anyChanged = false
  for (const fileName of sessionFiles) {
    const sessionId = fileName.replace(/\.json$/, '')
    if ((fsMeta[sessionId]?._downloadTime || 0) > 0) continue
    const filePath = resolve(rawDir, fileName)
    const stored = await readJsonFile<StoredSessionData>(filePath, null as any)
    if (!stored?.meta) {
      throw new Error(`Session file missing meta: ${filePath}`)
    }
    assert(stored.meta.sessionId === sessionId, `Session ID mismatch in ${filePath}`)
    fsMeta[sessionId] = {
      ...stored.meta,
      _downloadTime: stored._downloadTime,
    }
    anyChanged = true
  }
  if (anyChanged) {
    await writeJsonFile(fsMetaPath, fsMeta)
  }
  return { fsMeta, fsMetaPath }
}

const syncSessions = async (mode: DataMode) => {

  const dbMeta = await getDatabasePath<Record<string, SessionMeta>>(`${mode}/meta`)
  if (!dbMeta) {
    console.warn('no session metadata found in database for mode ', mode)
    return { meta: {}, numUpdated: 0, numError: 0 }
  }

  const { fsMeta, fsMetaPath } = await getFsMeta(mode)

  const sessionsToUpdate = Object.entries(dbMeta)
    .filter(([sessionId, meta]) => (fsMeta[sessionId]?._downloadTime || 0) < meta.lastUpdateTime)
    .map(([sessionId, meta]) => ({ sessionId, meta }))
  
  console.log(`--- syncing ${sessionsToUpdate.length} sessions ---`)
  let numUpdated = 0
  let numError = 0
  const batchSize = 20
  for (let i = 0; i < sessionsToUpdate.length; i += batchSize) {
    const batch = sessionsToUpdate.slice(i, i + batchSize)
    const results = await Promise.all(batch.map(async ({ sessionId, meta }) => {
      const now = Date.now()
      const sessionData = await fetchSessionDataFromDb(mode, sessionId, meta)
      // console.log(`fetchSessionDataFromDb(${sessionId}) took ${Date.now() - now}ms`)
      if (!sessionData) {
        console.error('session data not found', sessionId)
        numError++
        return null
      }
      if (!sessionData.meta.sessionId) {
        console.error('sessionData.meta has no sessionId', sessionId, sessionData.meta)
        numError++
        return null
      }
      await writeLocalSessionData(mode, sessionData, now)
      return {
        sessionId,
        meta: sessionData.meta,
        downloadTime: now,
      }
    }))
    const updated = results.filter((item) => item !== null)
    numUpdated += updated.length
    updated.forEach(({ sessionId, meta, downloadTime }) => {
      fsMeta[sessionId] = {
        ...meta,
        _downloadTime: downloadTime,
      }
    })
    // checkpointing in case of interruption
    await writeJsonFile(fsMetaPath, fsMeta)
  }

  // if (numUpdated > 0) {
  //   await writeJsonFile(fsMetaPath, fsMeta)
  // }
  return { meta: fsMeta, numUpdated, numError }
}

export default defineEventHandler(async (event) => {
  if (event.method !== 'POST') {
    throw createError({
      statusCode: 405,
      message: `Method ${event.method} not allowed`,
    })
  }
  if (syncRunning) {
    console.error('sync is already running')
    throw createError({
      statusCode: 429,
      message: 'Sync is already running',
    })
  }
  const body = await readBody(event)
  const mode = body?.mode as DataMode | undefined
  if (mode !== 'live' && mode !== 'debug') {
    throw createError({
      statusCode: 400,
      message: 'mode must be live or debug',
    })
  }
  try {
    syncRunning = true
    return await syncSessions(mode)
  } catch (error) {
    console.error('error syncing data', error)
    throw error
  }
  finally {
    syncRunning = false
  }
})
