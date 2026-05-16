export const usePosthog = createGlobalState(() => {
  
  const { $posthog } = useNuxtApp()
  const posthog = $posthog()
  posthog.onSessionId((sessionId) => {
    console.log('posthog.sessionId', sessionId)
    logEvent('posthog.sessionId', { sessionId })
    useDataWriter().updateOther('posthog/sessionId', sessionId)
  })
  // posthog.debug(debug)

  const status = ref<'loading' | 'blocked' | 'ready'>('loading')

  // Check if PostHog is blocked by ad blocker via direct network request

  const tryFetch = async () => {
    logEvent('posthog.tryFetch')
    try {
      await fetch('https://us.i.posthog.com/decide/?v=3', {
        method: 'HEAD',
        mode: 'no-cors',
      })
      return true
    } catch (error: any) {
      return false
    }
  }

  const checkStatus = async (nTry=3) => {
    logEvent('posthog.loading')
    status.value = 'loading'
    for (let i = 0; i < nTry; i++) {
      if (await tryFetch()) {
        logEvent('posthog.ready')
        status.value = 'ready'
        useDataWriter().updateOther('posthog/blocked', false)
        return false
      } else {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }
    logEvent('posthog.blocked')
    useDataWriter().updateOther('posthog/blocked', true)

    status.value = 'blocked'
    return true
  }

  checkStatus()

  // capture logged events
  const whiteList = [
    'epoch.start',
    'bonus.update'
  ]
  const blackList: string[] = []
  const maxCount = 100
  
  const eventCounts = {} as Record<string, number>
  const shouldCapture = (event: LogEvent) => {
    if (whiteList.includes(event.eventType)) return true
    if (blackList.includes(event.eventType)) return false
    // non-specified events are kept up to maxCount occurrences
    eventCounts[event.eventType] ??= 0
    const count = ++eventCounts[event.eventType]
    if (count < maxCount) return true
    if (count == maxCount) {
      posthog.capture('usePosthog.maxCountReached', { eventType: event.eventType })
    }
    return false
  }
  useLogEventBus().on((event) => {
    if (shouldCapture(event)) {
      posthog.capture(event.eventType, event)
    }
  })

  // capture errors (letting them pass through)
  useErrorHandler().pushHandler((err, instance, info, next) => {
    try {
      posthog.captureException(err, {
        vue_info: info, // string
        component_name: instance?.$options?.__name,
        component_path: instance?.$options?.__file,
        current_epoch: useCurrentEpoch().value.id,
      })
    } finally {
      next()
    }
  }, 10)
  


  return {
    status,
    checkStatus
  }
})
