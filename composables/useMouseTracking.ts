
interface MouseTracking {
  pause: () => void
  resume: () => void
  done: () => MouseTrackingData
  cancel: () => void
  recordFrame: () => void
  x: Ref<number>
  y: Ref<number>
}

// minPixels is the move distance necessary to trigger a recording
// {min,max}Rate bounds recordings per second, trumps minPixels (unless zero movement)
export interface MouseTrackingOptions {
  minPixels?: number
  minRate?: number
  maxRate?: number
  maxFrames?: number
}

export interface MouseTrackingData {
  x: Array<number>
  y: Array<number>
  t: Array<number>
  startTime: number
  currentEpochId: string
  endTime: number
}

let currentInstance: MouseTracking | null = null


export const useMouseTracking = (options: MouseTrackingOptions = {}): MouseTracking => {
  if (currentInstance) {
    console.warn('Mouse tracking already active, stopping previous instance')
    currentInstance.done()
  }
  let isActive = true

  const { minPixels = 10, minRate = 1, maxRate = 60, maxFrames = 10_000 } = options
  const minInterval = 1000 / maxRate
  const maxInterval = 1000 / minRate

  const rect = computed(() => mainContentRef.value?.getBoundingClientRect())
  const mouse = useMouse()
  const dataWriter = useDataWriter()

  const data: MouseTrackingData = {
    x: [],
    y: [],
    t: [],
    startTime: Date.now(),
    currentEpochId: useCurrentEpoch().value.id,
    endTime: NaN,
  }

  const x = computed(() => mouse.x.value - (rect.value?.left ?? NaN))
  const y = computed(() => mouse.y.value - (rect.value?.top ?? NaN))

  let isPaused = false
  let lastRecordTime = 0
  let lastRecordX = 0
  let lastRecordY = 0
  let stopWatch: (() => void) | null = null

  const shouldRecord = () => {
    if (isPaused || !rect.value) return false
    if (data.x.length == 0) return true

    const now = Date.now()
    const timeSinceLastRecord = now - lastRecordTime
    if (timeSinceLastRecord < minInterval) return false

    const dx = x.value - lastRecordX
    const dy = y.value - lastRecordY
    const distance = Math.sqrt(dx ** 2 + dy ** 2)
    if (distance === 0) return false

    if (timeSinceLastRecord > maxInterval) return true
    return distance > minPixels
  }

  const recordFrame = () => {
    data.x.push(x.value)
    data.y.push(y.value)
    data.t.push(Date.now() - data.startTime)

    lastRecordX = x.value
    lastRecordY = y.value
    lastRecordTime = Date.now()

    if (data.x.length >= maxFrames) {
      logEvent('mouseTracking.maxFramesReached')
      done()
    }
  }

  const pause = () => {
    isPaused = true
  }

  const resume = () => {
    isPaused = false
    lastRecordTime = Date.now()
  }

  const done = () => {
    if (!isActive) {
      console.warn('mouseTracking.done() called while not active; no new data will be recorded')
      return data
    }
    isActive = false
    currentInstance = null
    stopWatch?.()
    data.endTime = Date.now()
    dataWriter.updateOther(`mouse/${data.startTime}`, data)
    return data
  }

  const cancel = () => {
    if (!isActive) return
    isActive = false
    currentInstance = null
    stopWatch?.()
  }

  // Watch mouse movements and record frames when conditions are met
  stopWatch = watchImmediate([mouse.x, mouse.y, rect], () => {
    if (shouldRecord()) {
      recordFrame()
    }
  })

  onScopeDispose(() => {
    if (isActive) done()
  })

  currentInstance = {
    pause,
    resume,
    done,
    cancel,
    recordFrame,
    x,
    y,
  }
  return currentInstance
}
