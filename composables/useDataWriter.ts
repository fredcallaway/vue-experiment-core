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

// Recovery queues that were never flushed accumulate in localStorage and can eventually exhaust
// the origin's quota, which breaks unrelated features (see core/CHANGES.md). A queue is only
// reclaimable once it can no longer be flushed by the session that owns it, so we require both:
// it belongs to some *other* session, and it is old enough that the session is certainly gone.
const STALE_QUEUE_MAX_AGE_MS = 8 * 60 * 60 * 1000  // 8 hours

// A stored queue is `Record<dbPath, value>` with no timestamp of its own, so age is derived from
// the queued data. Every flush writes `<mode>/meta/<sessionId>/lastUpdateTime = <now>` into the
// queue, and event paths are keyed `<timestamp>—<index>—…`, so any non-trivial queue carries at
// least one timestamp. Returns null when none is found — callers must not treat that as old.
const queueTimestamp = (updates: Record<string, unknown>): number | null => {
  let latest: number | null = null
  const consider = (value: unknown) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return
    latest = latest === null ? value : Math.max(latest, value)
  }

  for (const [path, value] of Object.entries(updates)) {
    if (path.endsWith('/lastUpdateTime')) consider(value)
    const eventKey = path.split('/').pop() ?? ''
    const [maybeTimestamp] = eventKey.split('—')
    if (maybeTimestamp && /^\d+$/.test(maybeTimestamp)) consider(Number(maybeTimestamp))
  }
  return latest
}

// Drop other sessions' recovery queues once they are older than STALE_QUEUE_MAX_AGE_MS. Deliberately
// conservative: a queue whose age cannot be established is kept, because deleting it would discard
// participant data that never reached the database.
const sweepStaleQueues = (currentSessionId: string) => {
  if (typeof localStorage === 'undefined') return

  const keep = storageKey(currentSessionId)
  const now = Date.now()

  for (const key of Object.keys(localStorage)) {
    if (!key.startsWith('dataWriter-') || key === keep) continue

    const raw = localStorage.getItem(key)
    if (!raw) continue

    let updates: Record<string, unknown>
    try {
      updates = JSON.parse(raw)
    } catch {
      // Unparseable: it cannot be flushed or dated, but it is also not recoverable data. Leave it
      // rather than guess; it is a single key and does not grow.
      console.warn(`DataWriter: could not parse stored queue ${key}; leaving it in place.`)
      continue
    }

    if (Object.keys(updates).length === 0) {
      localStorage.removeItem(key)
      continue
    }

    const timestamp = queueTimestamp(updates)
    if (timestamp === null) {
      console.warn(`DataWriter: stored queue ${key} has no timestamp; keeping it (cannot confirm it is stale).`)
      continue
    }
    if (now - timestamp < STALE_QUEUE_MAX_AGE_MS) continue

    const hours = ((now - timestamp) / 3_600_000).toFixed(1)
    console.warn(
      `DataWriter: discarding stale recovery queue ${key} `
      + `(${Object.keys(updates).length} updates, last activity ${hours}h ago).`,
    )
    localStorage.removeItem(key)
  }
}

type WriteMode = DataMode | 'dummy'

const normalizeDatabaseShape = (value: unknown): unknown => {
  const walk = (data: SafeData): unknown => {
    if (Array.isArray(data)) return data.map(walk)
    if (data && typeof data === 'object') {
      const entries = Object.entries(data)
        .map(([key, child]) => [key, walk(child)] as const)
        .filter(([, child]) => child !== undefined)

      if (entries.length === 0) return undefined
      return Object.fromEntries(entries)
    }
    return data
  }

  return walk(toSafeData(value))
}

export class DataWriter {
  private meta: SessionMeta | null = null  // null before initialized
  private mode: WriteMode = 'dummy'
  private updates: Ref<Record<string, any>> // path -> value (now reactive)
  private delay: number
  private maxWait: number
  private debounceFlush: () => void
  private disabled: boolean = false
  private _events: LogEvent[] = []
  // each page load gets a unique client id; the database records the single active
  // client for each session, and any other client (e.g. an older tab) stops writing
  private clientId = `${Date.now()}-${trueRandom().toString(36).substring(2, 11)}`
  readonly superseded = ref(false)

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
      // Reclaim quota from queues abandoned by earlier sessions. Runs before we open this
      // session's queue so it can never touch the one we are about to use.
      sweepStaleQueues(meta.sessionId)
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
          const fiveMinutesAgo = Date.now() - 5 * 60 * 1000
          if (oldMeta.noReturnTime || oldMeta.error || oldMeta.completionTime || oldMeta.startTime < fiveMinutesAgo ) {
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

      // claim the session for this client; any previously active client stops writing
      await this.claimClient()

      // _flush writes the full meta object, so only participant-driven metadata changes
      // should schedule another flush. Ignore fields maintained by _flush itself.
      let previousMeta = R.clone(toRaw(meta))
      watchDeep(meta, () => {
        const changed = (Object.keys(meta) as (keyof SessionMeta)[]).some(key => {
          if (key === 'lastUpdateTime' || key === 'inactiveTime') return false
          return !R.isDeepEqual(meta[key], previousMeta[key])
        })
        previousMeta = R.clone(toRaw(meta))
        if (changed) this.debounceFlush()
      })

      // double check that meta has been saved correctly
      const snapshot2 = await db.get(this.dbPath('meta'))
      const dbMeta = snapshot2.val() as SessionMeta
      const localMeta = toRaw(meta)
      if (!R.isDeepEqual(normalizeDatabaseShape(localMeta), normalizeDatabaseShape(dbMeta))) {
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
    await this._flush()
  }

  private async _flush() {
    if (!online.value) return
    if (this.disabled || this.superseded.value) return
    if (!this.meta) return

    const now = Date.now()

    this.syncIdleTime()
    this.meta.lastUpdateTime = now

    // pull out current updates
    const toFlush = toRaw(this.updates.value)
    this.updates.value = {}
    // every flush writes the full meta object, so the database copy always
    // exactly mirrors the client's copy (modulo the debounce delay)
    toFlush[this.dbPath('meta')] = normalizeDatabaseShape(toRaw(this.meta))

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
    if (this.meta.completionTime) return  // because active time uses completionTime
    this.meta.inactiveTime = useInactivityTracker().getTotalInactiveTime()
  }

  private clientPath(): string {
    return `${this.mode}/client/${this.sessionId}`
  }

  // record this client as the single active client for the session and stop
  // writing if another client (e.g. a newer tab) claims it later
  private async claimClient() {
    const db = useDatabase()
    await db.set(this.clientPath(), this.clientId)
    db.onValue(this.clientPath(), (snap) => {
      if (snap.val() !== this.clientId) {
        this.supersede()
      }
    })
  }

  private supersede() {
    if (this.superseded.value) return
    this.superseded.value = true
    console.warn('DataWriter: session claimed by another client; this tab will no longer save data')
  }

  private queueUpdate(fullPath: string, value: SafeData) {
    if (this.disabled || this.superseded.value) return
    console.debug('queueUpdate', {fullPath, value})
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
