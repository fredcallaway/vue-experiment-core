interface TimerOptions {
  immediate?: boolean
}

export const useTimer = (timeMs: number, { immediate = true }: TimerOptions = {}) => {
  const status = ref<'running' | 'paused' | 'done' | 'canceled'>('paused')
  const secondsLeft = ref(0)
  let lastPauseTimeLeft = timeMs
  let lastResumeTime: number | null = null
  let timeoutId: NodeJS.Timeout | null = null

  const { resolve, reject, promise } = Promise.withResolvers()
  const callbacks = [() => resolve(null)]

  const onDone = (callback: () => void) => {
    callbacks.push(callback)
  }
 
  const formattedTimeLeft = computed(() => {
    return formatTime(1000 * secondsLeft.value)
  })

  const getTimeLeft = () => {
    const elapsed = lastResumeTime ? Date.now() - lastResumeTime : 0
    return Math.max(0, lastPauseTimeLeft - elapsed)
  }

  const tick = () => {
    if (status.value !== 'running') return
    
    const timeLeft = getTimeLeft()
    secondsLeft.value = Math.ceil(timeLeft / 1000)
    
    if (timeLeft <= 0) {
      status.value = 'done'
      callbacks.forEach(callback => callback())
      return
    } else {
      const msUntilNextSecond = timeLeft % 1000 || 1000
      timeoutId = setTimeout(tick, msUntilNextSecond)
    }
  }

  const reset = () => {
    status.value = 'paused'
    secondsLeft.value = Math.ceil(timeMs / 1000)
    lastPauseTimeLeft = timeMs
    lastResumeTime = null
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
  }

  
  const resume = () => {
    if (status.value !== 'paused') throw new Error('Cannot resume timeout with status ' + status.value)
    
    status.value = 'running'
    lastResumeTime = Date.now()
    tick()
  }
  
  const pause = () => {
    if (status.value !== 'running') throw new Error('Cannot pause timeout with status ' + status.value)
    
    clearTimeout(assertDefined(timeoutId))
    timeoutId = null
    lastPauseTimeLeft = getTimeLeft()
    status.value = 'paused'
  }
  
  const cancel = () => {
    if (!['running', 'paused'].includes(status.value)) throw new Error('Cannot cancel timeout with status ' + status.value)

    clearTimeout(assertDefined(timeoutId))
    timeoutId = null
    reject(new Error('Timer canceled'))
    status.value = 'canceled'
  }

  reset()
  if (immediate) {
    resume()
  }
  
  return {
    reset,
    resume,
    pause,
    cancel,
    onDone,
    getTimeLeft,
    promise,
    status: readonly(status),
    secondsLeft: readonly(secondsLeft),
    formattedTimeLeft,
  }
}
