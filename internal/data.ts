// ============================================================================
// Core Types
// ============================================================================

export type DataMode = 'live' | 'debug'

export type SessionMeta = {
  sessionId: string
  participantId: string
  studyId: string
  version: string
  mode: DataMode
  startTime: number
  completionTime?: number
  lastUpdateTime: number
  bonus: number
  assignment?: number
  conditions?: Record<string, unknown>
}

export type LogEvent = {
  timestamp: number
  eventType: string
  currentEpochId: string
  index: number
  uid: string
  data: Record<string, unknown>
}

export type BaseLogEvent<D extends Record<string, unknown>> = LogEvent & {data: D}

export type EpochEvent = BaseLogEvent<{
  id: string
}>
export const isEpochEvent = (event: LogEvent): event is EpochEvent => {
  return 'id' in event.data && event.eventType.startsWith('epoch.')
}

export type PEvent = BaseLogEvent<{
  info: any
  pid: string
}>
export const isParticipantEvent = (event: LogEvent): event is PEvent => {
  return 'pid' in event.data && event.eventType.startsWith('participant.')
}

export type ErrorEvent = BaseLogEvent<{
  message: string
  info?: any
  cause?: any
  stack?: string
}>
export const isErrorEvent = (event: LogEvent): event is ErrorEvent => {
  return 'message' in event.data && event.eventType.startsWith('error')
}

export type SessionData = {
  meta: SessionMeta
  events: LogEvent[]
  other?: Record<string, unknown> | null // unstructured data
}

// ============================================================================
//  Database Structure
// ============================================================================

/**
* 
* {mode}/
* ├── meta/
* │   └── {sessionId}: SessionMeta
* ├── events/
* │   └── {sessionId}/
* │       └── {DBEventKey}: DBEventData
* └── other/
*     └── {sessionId}: Record<string, unknown> ... // optional unstructured data
* 
* NOTE: we invert the keys of the Session type to allow efficient
* processing of the different kinds of data (meta, events, other)
* 
*/

export type DBModeData = {
  meta: Record<string, SessionMeta>
  events: Record<string, DBSessionEvents>
  other: Record<string, Record<string, unknown>>
}

// NOTE: using em dash as separator to avoid clash with hyphen
// timestamp—index—eventType—uid

export type DBEventKey = `${number}—${number}—${string}—${string}`
export type DBEventData = Record<string, unknown> | false
export type DBSessionEvents = Record<DBEventKey, DBEventData>

export const compressEvent = (event: LogEvent): [DBEventKey, DBEventData] => {
  const eventType = event.eventType.replaceAll('.', ':')
  const key = `${event.timestamp}—${event.index}—${eventType}—${event.uid}` as DBEventKey
  const data = Object.keys(event.data).length === 0 ? false : event.data
  // NOTE: we ignore currentEpochId because it can be reconstructed
  return [key, data]
}

export const decompressEvents = (record: DBSessionEvents): LogEvent[] => {
  let currentEpochId = ''
  return R.entries(record).map(([key, data]) => {
    if (data === false) data = {} // RTDB doesn't allow {} as a value
    const [timestamp, index, eventTypeRaw, uid] = key.split('—')
    const eventType = eventTypeRaw.replaceAll(':', '.')
    if (eventType.startsWith('epoch.')) {
      currentEpochId = assertString(data.id)
    }
    return {
      timestamp: ensureNumber(timestamp),
      index: ensureNumber(index),
      eventType,
      uid,
      data: assertObject(data),
      currentEpochId,
    }
  })
}

export const getDBPath = (mode: DataMode, sessionId: string, kind: keyof SessionData, key: string = '') => {
  return `${mode}/${kind}/${sessionId}/${key}`
}

// export const dbPaths = {
//   /** Get path to session metadata: {mode}/_meta or {mode}/_meta/{sessionId} */
//   meta: (mode: DataMode, sessionId?: string) => 
//     sessionId ? `${mode}/_meta/${sessionId}` : `${mode}/_meta`,
  
//   /** Get path to session data: {mode}/{sessionId} or {mode}/{sessionId}/{subpath} */
//   session: (mode: DataMode, sessionId: string, subpath?: string) => 
//     subpath ? `${mode}/${sessionId}/${subpath}` : `${mode}/${sessionId}`,
  
//   /** Get path to events: {mode}/{sessionId}/events or {mode}/{sessionId}/events/{path} */
//   events: (mode: DataMode, sessionId: string, path?: string) => 
//     path ? `${mode}/${sessionId}/events/${path}` : `${mode}/${sessionId}/events`,
  
//   /** Get path to participant data: {mode}/{sessionId}/participant or {mode}/{sessionId}/participant/{path} */
//   participant: (mode: DataMode, sessionId: string, path?: string) => 
//     path ? `${mode}/${sessionId}/participant/${path}` : `${mode}/${sessionId}/participant`,
// }
