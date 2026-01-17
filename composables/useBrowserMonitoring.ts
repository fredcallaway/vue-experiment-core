const not = (x: MaybeRef<boolean>) => computed(() => !toValue(x))
const IDLE_TIME = 10 * 1000

const logTransitions = (enabled: Ref<boolean>, state: Ref<boolean>, eventPrefix: string) => {
  let startTime = NaN
  watch(() => toValue(state), (isActive) => {
    if (!enabled.value) return
    if (isActive) {
      logEvent(`${eventPrefix}.begin`)
      startTime = Date.now()
    } else {
      let duration = Date.now() - startTime
      if (eventPrefix == 'browser.idle') duration += IDLE_TIME
      logEvent(`${eventPrefix}.end`, { duration: isNaN(duration) ? undefined : duration })
      startTime = NaN
    }
  })
}

export const useBrowserMonitoring = useMemoize(() => {
  const offline = not(useOnline())
  const { idle } = useIdle(IDLE_TIME)
  const unfocused = not(useWindowFocus())
  const enabled = ref(true)

  logTransitions(enabled, idle, 'browser.idle')
  logTransitions(enabled, offline, 'browser.offline')
  logTransitions(enabled, unfocused, 'browser.unfocused')

  return { 
    idle, offline, unfocused, enabled,
    enable: () => enabled.value = true,
    disable: () => enabled.value = false,
  }
})

export const getBrowserInfo = () => {

  if (typeof navigator === 'undefined') {
    throw new Error('Browser info unavailable: navigator is undefined.')
  }
  if (typeof screen === 'undefined') {
    throw new Error('Browser info unavailable: screen is undefined.')
  }
  if (typeof window === 'undefined') {
    throw new Error('Browser info unavailable: window is undefined.')
  }

  const nav = navigator as Navigator & { deviceMemory?: number }

  return {
    userAgent: nav.userAgent,
    language: nav.language,
    languages: nav.languages,
    platform: nav.platform,
    vendor: nav.vendor,
    cookieEnabled: nav.cookieEnabled,
    hardwareConcurrency: nav.hardwareConcurrency,
    deviceMemory: nav.deviceMemory,
    maxTouchPoints: nav.maxTouchPoints,
    screen: {
      width: screen.width,
      height: screen.height,
      availWidth: screen.availWidth,
      availHeight: screen.availHeight,
      colorDepth: screen.colorDepth,
      pixelDepth: screen.pixelDepth,
    },
    window: {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
    },
  }
}