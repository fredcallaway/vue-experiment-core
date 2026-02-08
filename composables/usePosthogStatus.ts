export const usePosthogStatus = (debug: boolean = false) => {
  
  const { $posthog } = useNuxtApp()
  const posthog = $posthog()
  posthog.debug(debug)

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
        return false
      } else {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }
    logEvent('posthog.blocked')
    status.value = 'blocked'
    return true
  }

  checkStatus()

  whenever(() => status.value === 'ready', () => {
    posthog.capture('posthog.ready')
  })

  return {
    status,
    checkStatus
  }
}