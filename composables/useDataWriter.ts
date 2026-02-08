import { useStorage } from '@vueuse/core'
import { logError, logEvent } from './logEvent'
import { useInactivityTracker } from './useInactivityTracker'
let dbInstance: DataWriter | null = null

const online = useOnline()

export function useDataWriter(): DataWriter {
  if (!dbInstance) {
    dbInstance = new DataWriter()
  }
  return dbInstance
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
  private _events: LogEvent[] = []

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

  get events(): ReadonlyArray<LogEvent> {
    return this._events
  }

  get sessionId() {
    return this.meta?.sessionId ?? '__PREINIT__'
  }

  async initializeSession(meta: SessionMeta): Promise<unknown> {
    if (this.disabled) {
      console.warn('DataWriter: called initializeSession while disabled; ignoring')
      return false
    }
    console.log('DataWriter: initializing session:', toRaw(meta))

    this.meta = meta
    this.mode = meta.mode

    logEvent('DataWriter.initializeSession', meta)


    const currentUpdates = this.updates.value
    this.clearQueue() // we put them back later

    if (Object.keys(currentUpdates).length > 0) {
      console.log('initializeSession: found existing updates', toRaw(currentUpdates))
    }

    // in live mode, the queue is held in local storage so it can be recovered after a refresh
    if (meta.mode === 'live') {
      this.updates = useStorage(storageKey(meta.sessionId), {}, localStorage, {
        serializer: {
          read: (v: string) => v ? JSON.parse(v) : {},
          write: (v: Record<string, any>) => JSON.stringify(v),
        }
      })
      if (Object.keys(this.updates.value).length > 0) {
        console.log('recovered updates from localStorage', this.updates.value)
        logEvent('DataWriter.recoveredUpdates', { numUpdates: Object.keys(this.updates.value).length })
      }
    }

    // migrate updates from __PREINIT__ to the new sessionId
    for (const [key, value] of Object.entries(currentUpdates)) {
      const newKey = key.replace('__PREINIT__', meta.sessionId).replace('dummy/', `${this.mode}/`)
      this.updates.value[newKey] = value
    }
    try {
      // ensure connection to database
      const db = useDatabase()
      await db.assertConnected()

      const snapshot = await db.get(this.dbPath('meta'))
      if (snapshot.exists()) {
        // this session has already been initialized
        const oldMeta = snapshot.val() as SessionMeta
        logEvent('DataWriter.repeatSession', { oldMeta, newMeta: meta })

        if (!oldMeta.sessionId && !oldMeta.startTime) {
          // I'm not sure exactly how this happens
          logEvent('DataWriter.repeatSession.overwrite')
          meta.lastUpdateTime = Date.now()
          await db.set(this.dbPath('meta'), meta)
        } else {
          // don't allow restarting if the actual experiment has begun or errored
          if (oldMeta.noReturnTime || oldMeta.error) {
            logEvent('DataWriter.repeatSession.alreadyStarted')
            throw new Error("DataWriter.repeatSession.alreadyStarted")
          }
          for (const key of ['sessionId', 'participantId', 'studyId', 'version', 'mode', 'assignment'] as const) {
            if (oldMeta[key] !== meta[key]) {
              logEvent('DataWriter.repeatSession.mismatch', { key })
              throw new Error("DataWriter.repeatSession.mismatch")
            }
          }
          logEvent('DataWriter.repeatSession.update')
          Object.assign(meta, oldMeta)
        }
      }
      else { // no existing data (expected case)
        logEvent('DataWriter.initializeSession.noExistingData')
        meta.lastUpdateTime = Date.now()
        await db.set(this.dbPath('meta'), meta)
      }

      // watch for changes to the meta object and update the database
      let prevMeta = R.clone(toRaw(meta))
      watchDeep(meta, () => {
        const changes: Record<string, any> = {}
        for (const key in meta) {
          const typedKey = key as keyof SessionMeta
          // these are handled separately because they are updated in _flush
          if (typedKey === 'lastUpdateTime' || typedKey === 'inactiveTime') continue
          if (!R.isDeepEqual(meta[typedKey], prevMeta[typedKey])) {
            changes[typedKey] = meta[typedKey]
          }
        }
        prevMeta = R.clone(toRaw(meta))

        if (Object.keys(changes).length > 0) {
          this.updateMeta(changes as Partial<SessionMeta>)
        }
      })

      // double check that meta has been saved correctly
      const snapshot2 = await db.get(this.dbPath('meta'))
      const dbMeta = snapshot2.val() as SessionMeta
      const localMeta = toRaw(meta)
      if (!R.isDeepEqual(localMeta, dbMeta)) {
        logError('DataWriter.metaMismatch', {localMeta, dbMeta})
      }
      assert(dbMeta.sessionId == localMeta.sessionId, 'sessionId must match between meta and database')

      return true // success

    } catch (error) {
      console.error('Failed to initialize database connection.', error)
      this.mode = 'dummy'
      console.warn('DataWriter: falling back to dummy mode due to database initialization error')
      return error
    }
  }

  pushEvent(event: LogEvent) {
    this._events.push(event)
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

  updateOther(path: string, value: any) {
    const fullPath = this.dbPath('other', path)
    this.queueUpdate(fullPath, toSafeData(value))
  }

  async withDisabled<T>(fn: () => Promise<T>): Promise<T> {
    const prevDisabled = this.disabled
    this.disabled = true
    try {
      return await fn()
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
    this.syncIdleTime()
    const db = useDatabase()
    await db.set(this.dbPath('meta'), this.meta)

    // TODO: also flush other (when we support that)

    await this._flush()
  }

  private async _flush() {
    if (!online.value) return
    if (this.disabled) return
    if (!this.meta) return

    const now = Date.now()

    this.syncIdleTime()

    // pull out current updates
    const toFlush = toRaw(this.updates.value)    
    this.updates.value = {}
    // update lastUpdateTime
    this.meta.lastUpdateTime = now
    toFlush[this.dbPath('meta', 'lastUpdateTime')] = now

    if (this.mode === 'dummy') {
      console.debug(`fake-flushed ${Object.keys(toFlush).length} updates`, toFlush)
      return
    }
    
    try {
      const db = useDatabase()

      // this should be impossible, will remove when I'm more confident
      if (Object.keys(toFlush).some(key => key.includes('__PREINIT__'))) {
        logError('tried to flush updates with __PREINIT__ as sessionId')
        this.clearQueue()
      } else {
        await db.update('/', toFlush)
      }
      console.debug(`flushed ${Object.keys(toFlush).length} updates`, toFlush)
    } catch (error) {
      console.error('Failed to flush updates:', error, toFlush)
      logError('Failed to flush updates', {
        error: JSON.stringify(error), 
        updates: JSON.stringify(toFlush)
      })
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

  private syncIdleTime() {
    if (!this.meta) return
    const inactiveTime = useInactivityTracker().getTotalInactiveTime()
    this.meta.inactiveTime = inactiveTime
    if (typeof inactiveTime !== 'number' || !Number.isFinite(inactiveTime)) return
    this.updates.value[this.dbPath('meta', 'idleTime')] = inactiveTime
  }

  private queueUpdate(fullPath: string, value: SafeData) {
    if (this.disabled) return
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
