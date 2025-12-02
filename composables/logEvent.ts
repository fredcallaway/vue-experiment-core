// import type { LogEvent } from '~/shared/data'
// import { trueRandom } from '~/utils/globals'
import {useCurrentEpoch} from './useEpoch'

let currentIndex = 0

export const useLogEventBus = () => useEventBus<LogEvent>('events')

export const logEvent = (eventType: string, data?: Record<string, unknown>, saveToDB = !eventType.startsWith('debug.')) => {

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
    data: data ?? {},
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

// logError(new Error('test error'), 'in trial set up')
// logError('my error', {reason: 'test reason'})
export const logError = (...args: [Error, any?] | [string, any?]) => {
  // JSON wrapping ensures it's safe to send to database
  const errorData = JSON.parse(JSON.stringify(extractErrorData(...args)))
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
