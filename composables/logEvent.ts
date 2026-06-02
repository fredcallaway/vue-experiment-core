// import type { LogEvent } from '~/shared/data'
// import { trueRandom } from '~/utils/globals'
import {useCurrentEpoch} from './useEpoch'

let currentIndex = 0

export const useLogEventBus = () => useEventBus<LogEvent>('events')

export const logEvent = (eventType: string, data?: Record<string, unknown>, saveToDB = !eventType.startsWith('debug.')) => {
  console.debug('logEvent', eventType, data)
  const safeData = toSafeDataObject(data ?? {})

  const dataWriter = useDataWriter()

  const illegal = /[:—#$[\]]/g // `:` and `—` (em dash) are used internally
  if (saveToDB && illegal.test(eventType)) {
    console.warn(`logEvent("${eventType}", ...) contains illegal characters ( —$:#$[] ); replacing them with "_"`)
  }

  const bus = useLogEventBus()

  const event: LogEvent = {
    eventType,
    timestamp: Date.now(),
    index: currentIndex++,
    uid: trueRandom().toString(36).substring(2, 9),
    data: safeData,
    currentEpochId: useCurrentEpoch().value.id,
  }
  if (saveToDB) {
    dataWriter.pushEvent(event)
  }
  bus.emit(event)
  return event
}

export const useDebugBus = () => useEventBus<any>('debug-bus')
export const logDebug = (message: string, info?: any) => {
  const bus = useDebugBus()
  bus.emit({
    message,
    info: toRaw(info),
    timestamp: Date.now(),
  })
  console.log('logDebug', message, info)
}

export const logWarn = (message: string, info?: unknown) => {
  console.warn('⚠️', message, info)
  logEvent('warn', { message, info })
}

export const declareEventLogger = <T extends SafeDataObject>(name: string) => {
  const logger = (data: T) => {
    logEvent(name, data)
  }
  const eventFilter = (e: LogEvent): e is BaseLogEvent<T> => e.eventType == name
  return [logger, eventFilter] as const
}

type ErrorData = {
  message: string
  info?: any
  cause?: any
  stack?: string
}

function extractErrorData(...args: [Error, any?] | [string, any?]): ErrorData {
  if (isError(args[0])) {
    const [error, info] = args
    return {
      message: error.message,
      info,
      cause: error.cause,
      stack: error.stack,
    }
  } 
  else if (typeof args[0] === 'string') {
    const [message, other] = args
    if (isError(other)) {
      return {
        message,
        cause: other.cause,
        stack: other.stack,
      }
    } else {
      return   { message, info: other}
    }
  }
  else {
    console.error('extractErrorData called with invalid arguments:', args)
    return {
      message: 'invalid logEvent arguments',
      info: {args},
    }
  }
}

// Timestamp of the most recent surfaced error. Used to suppress cascade guards:
// a single root-cause error (e.g. a child whose setup threw) leaves the app in a
// half-mounted state that trips downstream sanity checks, which then throw their
// own (misleading) errors. Such guards can call recentlyErrored() to stay quiet
// when a real error has just been reported.
let lastErrorTime = 0
export const recentlyErrored = (withinMs = 1000) => Date.now() - lastErrorTime < withinMs

// logError(new Error('test error'), 'in trial set up')
// logError('my error', {reason: 'test reason'})
export const logError = (...args: [Error, any?] | [string, any?]) => {
  lastErrorTime = Date.now()
  const errorData = toSafeDataObject(extractErrorData(...args))
  logEvent('error', errorData)
  console.error('logError', ...args)
}

export const useErrorLogging = createGlobalState(() => {
  const enabled = ref(true)
  const unsubscribers: (() => void)[] = []

  watchImmediate(enabled, (newEnabled) => {
    if (newEnabled) {
      if (unsubscribers.length > 0) return
      unsubscribers.push(useEventListener(window, 'unhandledrejection', event => {
        if (event.reason === 'useLocalAsync:unmounted') return
        logError('app.unhandledrejection', event.reason)
      }));

      unsubscribers.push(useEventListener(window, 'error', event => {
        if (event.message == 'ResizeObserver loop completed with undelivered notifications.') return
        logError('app.error', event.error ?? event)
      }));
    }
    else {
      unsubscribers.forEach(unsubscriber => unsubscriber())
    }
  })

  return {
    enabled,
    enable: () => enabled.value = true,
    disable: () => enabled.value = false,
  }
})
