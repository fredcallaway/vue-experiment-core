import { sessionStatus, type SessionStatus } from '~/core/internal/local-data'
import type { SessionData, SessionMeta, LogEvent } from '~/core/internal/data'

type TimeInterval = { start: number, end: number }
const MIN_IDLE_DURATION = 30 * 1000

type DataStatusText = 'missing' | 'minimal' | 'partial' | 'full'
type DataStatus = { text: DataStatusText, color: string }

export const useSessionStats = (sessionData: Ref<SessionData | null> | ComputedRef<SessionData | null>) => {
  const meta = computed(() => sessionData.value?.meta ?? null)
  const events = computed(() => sessionData.value?.events ?? [])

  const status = computed<SessionStatus | null>(() => {
    if (!meta.value) return null
    return sessionStatus(meta.value)
  })

  const getEndEvents = (eventType: string, sessionId: string) => {
    const beginCount = events.value.filter(event => event.eventType === `${eventType}.begin`).length
    const endEvents = events.value.filter(event => event.eventType === `${eventType}.end`)
    if (eventType === 'browser.unfocused') {
      const relevant = events.value
        .filter(event => event.eventType.startsWith(eventType))
        .sort((a, b) => a.timestamp - b.timestamp || a.index - b.index)
      const first = relevant[0]
      if (first?.eventType === `${eventType}.end`) {
        if (endEvents.length !== beginCount + 1) {
          throw new Error(`Mismatched ${eventType} begin/end events for session ${sessionId}`)
        }
        return endEvents.filter(event => event !== first)
      }
    }
    if (beginCount !== endEvents.length) {
      throw new Error(`Mismatched ${eventType} begin/end events for session ${sessionId}`)
    }
    return endEvents
  }

  const getIntervals = (eventType: string, minDuration: number, sessionId: string) => {
    return getEndEvents(eventType, sessionId)
      .map((event): TimeInterval | null => {
        const duration = event.data?.duration
        if (typeof duration !== 'number' || !Number.isFinite(duration)) {
          throw new Error(`Missing duration for ${event.eventType} in session ${sessionId}`)
        }
        if (duration < minDuration) return null
        return { start: event.timestamp - duration, end: event.timestamp }
      })
      .filter((interval): interval is TimeInterval => interval !== null)
  }

  const mergeIntervals = (intervals: TimeInterval[]) => {
    const sorted = R.sortBy(intervals, interval => interval.start)
    return sorted.reduce<TimeInterval[]>((acc, interval) => {
      const last = acc[acc.length - 1]
      if (!last || interval.start > last.end) return [...acc, interval]
      return [...acc.slice(0, -1), { start: last.start, end: Math.max(last.end, interval.end) }]
    }, [])
  }

  const totalTimeMs = computed<number | null>(() => {
    if (!meta.value) return null
    const endTime = meta.value.completionTime ?? meta.value.lastUpdateTime
    if (!endTime) throw new Error(`Missing end time for session ${meta.value.sessionId}`)
    return endTime - meta.value.startTime
  })

  const inactiveTimeMs = computed<number | null>(() => {
    if (!meta.value) return null
    const sessionId = meta.value.sessionId
    const intervals = [
      ...getIntervals('browser.idle', MIN_IDLE_DURATION, sessionId),
      ...getIntervals('browser.unfocused', 0, sessionId),
    ]
    const merged = mergeIntervals(intervals)
    return R.sum(merged.map(interval => interval.end - interval.start))
  })

  const activeTimeMs = computed<number | null>(() => {
    if (totalTimeMs.value === null || inactiveTimeMs.value === null) return null
    const active = totalTimeMs.value - inactiveTimeMs.value
    if (active < 0) throw new Error(`Active time is negative for session ${meta.value?.sessionId ?? 'unknown'}`)
    return active
  })

  const getDataStatus = (submissionStatus?: string): DataStatus => {
    if (!meta.value) return { text: 'missing', color: 'text-gray-400' }
    return getDataStatusFromMeta(meta.value, submissionStatus)
  }

  return {
    meta,
    status,
    totalTimeMs,
    inactiveTimeMs,
    activeTimeMs,
    getDataStatus,
  }
}

export const getDataStatusFromMeta = (meta: SessionMeta | null, submissionStatus?: string): DataStatus => {
  if (!meta) return { text: 'missing', color: 'text-gray-400' }
  if (!meta.noReturnTime) {
    if (submissionStatus === 'RETURNED') return { text: 'minimal', color: 'text-gray-400' }
    return { text: 'minimal', color: 'text-red-600' }
  }
  if (!meta.completionTime) return { text: 'partial', color: 'text-amber' }
  return { text: 'full', color: 'text-green-600' }
}
