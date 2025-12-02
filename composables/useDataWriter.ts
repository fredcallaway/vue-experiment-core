import { ref as dbRef, update, get, set, getDatabase, serverTimestamp } from 'firebase/database'
import { initializeApp } from 'firebase/app'
import { useStorage } from '@vueuse/core'
import { z } from 'zod'
import { logError } from './logEvent'
let dbInstance: DataWriter | null = null

const online = useOnline()

export const useDatabase = createGlobalState(() => {
  const config = useConfig()
  const firebaseApp = initializeApp(config.firebase)
  const firebaseDb = getDatabase(firebaseApp)
  return firebaseDb
})

export function useDataWriter(): DataWriter {
  if (!dbInstance) {
    dbInstance = new DataWriter()
  }
  return dbInstance
}

type SessionParams = { 
  sessionId: string, 
  participantId: string,  // default: 'UNKNOWN'
  studyId: string,  // default: 'UNKNOWN'
  mode: DataMode,  // default: 'debug'
  version: string,  // default: useConfig().version
}

const storageKey = (sessionId: string) => `dataWriter-${sessionId}`

type WriteMode = DataMode | 'dummy'

export class DataWriter {
  private meta: SessionMeta | null = null  // null before initialized
  private mode: WriteMode = 'dummy'
  private updates: Ref<Record<string, any>> // path -> value (now reactive)
  private delay: number
  private maxWait: number
  private debounceFlush: () => void
  private disabled: boolean = false

  constructor() {
    // this.sessionId = '__PREINIT__'  // until initialized
    this.mode = 'dummy' // until initialized
    this.delay = 1000 // ms
    this.maxWait = 5000 // ms
    
    this.updates = ref({})    
    this.debounceFlush = useDebounceFn(() => this._flush(), this.delay, { maxWait: this.maxWait })

    // Watch for network restoration and retry flush
    whenever(online, () => {
      this.debounceFlush()
    })    
  }

  get initialized() {
    return this.meta !== null
  }

  get sessionId() {
    return this.meta?.sessionId ?? '__PREINIT__'
  }

  async initializeSession(meta: SessionMeta) {
    if (this.disabled) {
      console.warn('DataWriter: called initializeSession while disabled; ignoring')
      return
    }

    this.meta = meta
    this.mode = meta.mode
    // const { sessionId, participantId, studyId, mode, version } = prm
    // this.sessionId = sessionId


    const currentUpdates = this.updates.value
    if (Object.keys(currentUpdates).length > 0) {
      console.log('initializeSession: found existing updates', currentUpdates)
    }

    if (meta.mode === 'live') {
      this.updates = useStorage(storageKey(meta.sessionId), {}, localStorage, {
        serializer: {
          read: (v: string) => v ? JSON.parse(v) : {},
          write: (v: Record<string, any>) => JSON.stringify(v),
        }
      })
      for (const [key, value] of Object.entries(currentUpdates)) {
        this.updates.value[key.replace('__PREINIT__', meta.sessionId)] = value
      }
    }

    const metaRef = dbRef(useDatabase(), this.dbPath('meta'))
    const snapshot = await get(metaRef)
    if (snapshot.exists()) {
      console.warn('DataWriter: repeat_session', meta.sessionId)
    }
    else {
      meta.lastUpdateTime = Date.now()
      await set(metaRef, meta)
    }

    // watch for changes to the meta object and update the database
    let prevMeta = structuredClone(toRaw(meta))
    watchDeep(meta, () => {
      const changes: Record<string, any> = {}
      for (const key in meta) {
        const typedKey = key as keyof SessionMeta
        if (typedKey === 'lastUpdateTime') continue
        if (!R.isDeepEqual(meta[typedKey], prevMeta[typedKey])) {
          changes[typedKey] = meta[typedKey]
        }
      }
      prevMeta = structuredClone(toRaw(meta))
      
      if (Object.keys(changes).length > 0) {
        this.updateMeta(changes as Partial<SessionMeta>)
      }
    })
  }

  pushEvent(event: LogEvent) {
    const [key, data] = compressEvent(event)
    const path = this.dbPath('events', key)
    this.queueUpdate(path, toRaw(data))
  }

  updateMeta(updates: Partial<SessionMeta>) {
    // logDebug('updateMeta', updates)
    // const updates = this.updates.value[path] || {}
    for (const [key, value] of Object.entries(updates)) {
      const path = this.dbPath('meta', key)
      this.queueUpdate(path, toRaw(value))
    }
  }

  async withDisabled(f: () => Promise<void>) {
    const prevDisabled = this.disabled
    this.disabled = true
    try {
      await f()
    } finally {
      // TODO: don't enable until ALL callbacks have finished (from other calls)
      this.disabled = prevDisabled
    }
  }

  disable() {
    this.disabled = true
  }

  async flush() {
    if (this.disabled) {
      console.warn('DataWriter.flush() called while disabled; possible mistake?')
      return
    }
    // ensure meta is fully up to date
    const metaRef = dbRef(useDatabase(), this.dbPath('meta'))
    await set(metaRef, this.meta)

    // TODO: also flush other (when we support that)

    this._flush()
  }

  private async _flush() {
    if (!online.value) return
    if (this.disabled) return
    if (!this.initialized) {
      console.debug('_flush called before initialized, holding updates in queue')
      return
    }
    
    try {
      if (this.mode !== 'dummy') {
        const lastUpdateTime = serverTimestamp() as unknown as number
        const path = this.dbPath('meta', 'lastUpdateTime')
        this.updates.value[path] = lastUpdateTime
        update(dbRef(useDatabase()), this.updates.value)
      }
      console.debug(`flushed ${Object.keys(this.updates.value).length} updates`, toRaw(this.updates.value))
      this.updates.value = {}
    } catch (error) {
      console.error('Failed to flush updates:', error, toRaw(this.updates.value))
    }
  }

  clearQueue() {
    this.updates.value = {}
  }

  get hasPendingUpdates(): boolean {
    return Object.keys(this.updates.value).length > 0
  }

  private dbPath(kind: keyof SessionData, key?: string): string {
    return getDBPath(this.mode as DataMode, this.sessionId, kind, key)
  }

  private queueUpdate(fullPath: string, value: any) {
    if (this.disabled) return
    
    // normalize value to JSON-compatible object as required by firebase
    if (typeof value == 'object') {
      value = R.omitBy(value, v => v === undefined)
    }
    const result = z.json().safeParse(value)
    if (result.success) {
      value = result.data
    } else {
      logError('non JSON-compatible value passed to queueUpdate (see console)', {fullPath, value})
      try {
        value = JSON.parse(JSON.stringify(value))
      } catch (error) {
        logError('failed to normalize value ', {error})
      }
    }
    console.debug('queueUpdate', fullPath, value)
    this.updates.value[fullPath] = value
    this.debounceFlush()
  }

  // updateOther(path: string, value: any) {
  //   if (this.mode === 'disabled') return
  //   // TODO: this will be like the old queueUpdate
  //   throw new Error('queueUpdate is not implemetned yet')
  // }

  // FOR FUTURE REFERENCE
  // queueUpdate(path: string, value: any) {
  //   throw new Error('queueUpdate is deprecated')
  //   if (this.mode === 'disabled') return

  //   // remove invalid values (function, undefined)
  //   value = JSON.parse(JSON.stringify(value))

  //   // Construct full path: {mode}/{sessionId}/{path}
  //   let fullPath = dbPaths.session(this.mode as DataMode, this.sessionId, path)
  //   const illegal = /[.#$[\]]/g
  //   if (illegal.test(fullPath)) {
  //     console.warn(`queueUpdate: path "${fullPath}" contains illegal characters ( $.#$[] ); replacing them with "_"`)
  //     fullPath = fullPath.replace(illegal, '_')
  //   }

  //   // collapse updates to the same path
  //   const currentUpdates = { ...this.updates.value }
  //   for (const existingPath in currentUpdates) {
  //     // If existing path is ancestor of new path, update the ancestor value
  //     if (fullPath.startsWith(existingPath + '/')) {
  //       const relativePath = fullPath.slice(existingPath.length + 1)
  //       const pathParts = relativePath.split('/')
  //       // @ts-ignore (existingPath has unknown size)
  //       const updatedValue = R.setPath(currentUpdates[existingPath], pathParts, value)
  //       currentUpdates[existingPath] = updatedValue
  //       this.updates.value = currentUpdates
  //       this.debounceFlush()
  //       return
  //     }
  //     // If existing path is descendant of new path, remove it
  //     if (existingPath.startsWith(fullPath + '/')) {
  //       Reflect.deleteProperty(currentUpdates, existingPath)
  //     }
  //   }

  //   currentUpdates[fullPath] = value
  //   this.updates.value = currentUpdates
  //   this.debounceFlush()
  // }
}