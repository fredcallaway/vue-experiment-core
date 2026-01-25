// ============================================================================
// Core Types
// ============================================================================
import { assertNumber, assertString } from '~/core/utils/asserts'  // no auto-imports on server
export type DataMode = 'live' | 'debug'

// data that can be reliably stored in the database (firebase RTDB)
export type SafeData =
| boolean
| number
| string
| null  // NOTE: RTDB will remove drop keys with null values
| SafeData[]
| { [k: string]: SafeData };

export type SafeDataObject = Record<string, SafeData>

export type SessionMeta = {
  sessionId: string
  participantId: string
  studyId: string
  version: string
  mode: DataMode
  startTime: number
  noReturnTime?: number
  completionTime?: number
  lastUpdateTime: number
  bonus: number
  assignment: number
  conditions?: SafeDataObject
  error?: string
}

export type LogEvent = {
  timestamp: number
  eventType: string
  currentEpochId: string
  index: number
  uid: string
  data: SafeDataObject
}

export type BaseLogEvent<D extends SafeDataObject> = LogEvent & {data: D}

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
  other?: SafeDataObject | null // unstructured data
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
*     └── {sessionId}: SafeDataObject ... // optional unstructured data
* 
* NOTE: we invert the keys of the Session type to allow efficient
* processing of the different kinds of data (meta, events, other)
* 
*/

export type DBModeData = {
  meta: Record<string, SessionMeta>
  events: Record<string, DBSessionEvents>
  other: Record<string, SafeDataObject>
}

// NOTE: using em dash as separator to avoid clash with hyphen
// timestamp—index—eventType—uid

export type DBEventKey = `${number}—${number}—${string}—${string}`
export type DBEventData = string | /* back compat */ SafeDataObject | false
export type DBSessionEvents = Record<DBEventKey, DBEventData>

export const compressEvent = (event: LogEvent): [DBEventKey, DBEventData] => {
  const eventType = event.eventType.replaceAll('.', ':')
  const key = `${event.timestamp}—${event.index}—${eventType}—${event.uid}` as DBEventKey
  const data = Object.keys(event.data).length === 0 ? "" : JSON.stringify(event.data)
  // NOTE: we ignore currentEpochId because it can be reconstructed
  return [key, data]
}

const parseEventData = (d: any): SafeDataObject => {
  if (typeof d !== 'string') {
    // BACKWARD COMPAT: previously used objects (and false for {})
    if (d === false) return {}
    return d
  }
  // NEW: we store as json to avoid RTDB quirks
  if (d === "") return {}
  return JSON.parse(d)
}
export const decompressEvents = (record: DBSessionEvents): LogEvent[] => {
  let currentEpochId = ''
  return Object.entries(record).map(([key, rawData]) => {
    const data = parseEventData(rawData)
    const [timestamp, index, eventTypeRaw, uid] = key.split('—')
    const eventType = eventTypeRaw.replaceAll(':', '.')
    if (eventType.startsWith('epoch.')) {
      currentEpochId = assertString(data.id)
    }
    return {
      timestamp: assertNumber(timestamp),
      index: assertNumber(index),
      eventType,
      uid,
      data,
      currentEpochId,
    }
  })
}

export const getDBPath = (mode: DataMode, sessionId: string, kind: keyof SessionData, key: string = '') => {
  return `${mode}/${kind}/${sessionId}${key ? `/${key}` : ''}`
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


export function toSafeData(input: unknown): SafeData {
  const seen = new WeakSet<object>();

  const walk = (x: any): SafeData => {
    // unwrap refs and vue proxies
    if (isRef(x)) x = x.value;
    if (isProxy(x)) x = toRaw(x);

    const t = typeof x;
    
    // primitives
    // NOTE: RTDB doesn't handle null, but we json it
    if (t === "string" || t === "boolean" || x === null) return x;
    if (t === "number") return Number.isFinite(x) ? x : String(x);
    if (t === "function") return x.name || String(x);

    // cannot be represented as is, fall back to string
    if (x === undefined || t === "symbol" || t === "bigint") {
      return String(x)
    };

    // objects
    if (typeof x === "object") {
      if (seen.has(x)) throw new TypeError("ensureSafeData: circular structure");
      seen.add(x);

      // strip classes
      if (x instanceof Date) return x.toISOString()
      if (x instanceof Set) return Array.from(x, walk);
      if (x instanceof Map) return Array.from(x.entries(), ([k, v]) => [walk(k), walk(v)]) as any;

      if (Array.isArray(x)) return x.map(walk);

      // plain-ish object: keep only enumerable string keys, drop undefined like JSON does
      const out: SafeDataObject = {};
      for (const [k, v] of Object.entries(x)) {
        if (v === undefined) continue;
        out[k] = walk(v);
      }
      return out;
    }

    throw new TypeError(`ensureSafeData: cannot convert ${x} to SafeData`);
  };

  return walk(input);
}

export function toSafeDataObject(input: Record<string, unknown>): SafeDataObject {
  return toSafeData(assertObject(input)) as SafeDataObject
}