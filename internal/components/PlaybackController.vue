<script lang="ts" setup>

type PlaybackState = 'stopped' | 'playing' | 'paused'

const props = defineProps<{
  events: LogEvent[]
  epoch: string | undefined
}>()

if (props.events.length === 0) {
  throw new Error('PlaybackController: No events provided')
}

useBrowserMonitoring().enabled.value = false

const { events, state, currentEventIndex, currentTime } = usePlaybackState()

const currentEpoch = useCurrentEpoch()

const allEvents = computed(() => {
  const events = props.events
  const start = assertDefined(R.find(events, e => e.eventType == 'epoch.start.experiment')).timestamp
  const result = events.map((e, idx) => ({
    ...e,
    timestamp: e.timestamp - start,
    data: toRaw(e.data),
    index: idx, // NOTE: overriding index
  }))
  console.log('allEvents', result)
  // check for events with non-matching index, resulting from restarting the experiment
  // console.log('allEvents', result)
  // const badIdx = result.findIndex(e => e.index !== e.index)
  // if (badIdx >= 0) {
  //   const n = result.splice(badIdx).length
  //   logDebug(`PlaybackController: removing ${n} events with non-matching index`)
  // }
  return result
})
syncRefs(allEvents, events)

const epochEvents = computed(() => {
  return R.pipe(
    allEvents.value,
    R.filter(isEpochEvent),
    // R.filter((event: EpochEvent, idx, arr) => {
    //   if (idx === 0) return true // first event is always included
    //   const prev = arr[idx - 1]
    //   // if (prev.index !== event.index - 1) return true // intervening events
    //   const fastChild = event.data.id.startsWith(prev.data.id) && event.timestamp - prev.timestamp < 100
    //   return !fastChild
    // }),
  )
})

// watchEffect(() => {
//   epochEvents.value.forEach(e => {
//     if (e.data.id !== e.currentEpochId) {
//       logDebug(`PlaybackController: epoch ${e.data.id} has mismatching currentEpochId ${e.currentEpochId}`)
//     }
//   })
// })


const participantEvents = computed(() => {
  return allEvents.value.filter(isParticipantEvent)
})

const totalDuration = computed(() => assertDefined(R.last(allEvents.value)?.timestamp))

const nextEvent = computed(() => {
  return allEvents.value[currentEventIndex.value + 1]
})

const timeToNextEvent = computed(() => {
  if (!nextEvent.value) return null
  return nextEvent.value.timestamp - currentTime.value
})

const currentEvent = computed(() => {
  return allEvents.value[currentEventIndex.value]
})

const bus = useParticipantBus()

let timeoutId: NodeJS.Timeout | undefined
let lastTickTime: number | null = null

const updateCurrentTime = () => {
  if (lastTickTime !== null) {
    const dt = Date.now() - lastTickTime
    currentTime.value += dt
  }
  lastTickTime = null
}

const waitForNextEventOrTick = async () => {
  clearTimeout(timeoutId!); timeoutId = undefined
  updateCurrentTime()
  lastTickTime = Date.now()
  const ttn = timeToNextEvent.value
  if (ttn === null) return // no more events
  if (ttn <= 0) { // next event is in the past -> trigger it
    const event = nextEvent.value

    if (isParticipantEvent(event)) {
      // Make sure we're in the right epoch
      if (currentEpoch.value.id !== event.currentEpochId) {
        logDebug('epoch mismatch in waitForNextEventOrTick', {currentEpochId: currentEpoch.value.id, eventCurrentEpochId: event.currentEpochId})
        // logDebug(`jumping from ${currentEpoch.value.id} to ${event.currentEpochId}`)
        // try {
        //   await jumpToEpoch(event.currentEpochId)
        // } catch (error) {
        //   console.error('error jumping to epoch', error)
        //   logDebug("waitForNextEventOrTick couldn't find epoch")
        // }
      }
      logEvent(event.eventType, event.data)
      bus.emit({...event})
    }

    currentEventIndex.value++
    waitForNextEventOrTick()
  } else {
    timeoutId = setTimeout(waitForNextEventOrTick, Math.min(ttn, 1000 / 60))
  }
}

const play = () => {
  if (state.value === 'playing') return
  state.value = 'playing'
  waitForNextEventOrTick()
}

const pause = () => {
  state.value = 'paused'
  updateCurrentTime()
  clearTimeout(timeoutId!); timeoutId = undefined
}

const togglePlayPause = () => {
  if (state.value === 'playing') {
    pause()
  } else {
    play()
  }
}

const next = () => {
  if (!nextEvent.value) return
  currentTime.value = nextEvent.value.timestamp
  state.value = 'playing'
  waitForNextEventOrTick()
}

const jumpToEpochEvent = async (epochEvent: EpochEvent) => {
  console.log('jumpToEpochEvent', epochEvent.data.id)
  await jumpToEpoch(epochEvent.data.id)
  currentTime.value = epochEvent.timestamp
  currentEventIndex.value = epochEvent.index
}

watchEffect(async () => {
  const epochId = props.epoch
  const epEvents = epochEvents.value
  if (!epochId || !epEvents.length) return
  console.log('jumping to epoch', epochId, epEvents)
  await timeoutPromise(100) // HACK: problem is with jumpToEpoch
  const epoch = epEvents.find(e => e.data.id === epochId)
  console.log('epoch', epoch)
  if (epoch) {
    await jumpToEpochEvent(epoch)
  }
})

const jumptoTime = async (time: number) => {
  const followingEpochIndex = R.sortedIndexWith(epochEvents.value, e => e.timestamp < time)
  await jumpToEpochEvent(epochEvents.value[followingEpochIndex-1])
}

const getRelativeClickX = (event: MouseEvent) => {
  const el = event.currentTarget as HTMLElement
  const { left, width } = el.getBoundingClientRect()
  return (event.clientX - left) / width
}

const handleTimelineClick = async (event: MouseEvent) => {
  const clickX = getRelativeClickX(event)
  const targetTime = clickX * totalDuration.value
  await jumptoTime(targetTime)
}

const ZOOM_WINDOW_MS = 30000 // 30 seconds
const zoomWindowStart = computed(() => {
  if (currentTime.value < ZOOM_WINDOW_MS / 2) {
    return 0
  }
  return Math.max(0, currentTime.value - ZOOM_WINDOW_MS / 2)
})
const zoomWindowEnd = computed(() => {
  if (currentTime.value < ZOOM_WINDOW_MS / 2) {
    return Math.min(totalDuration.value, ZOOM_WINDOW_MS)
  }
  return Math.min(totalDuration.value, currentTime.value + ZOOM_WINDOW_MS / 2)
})
const zoomWindowDuration = computed(() => zoomWindowEnd.value - zoomWindowStart.value)

const zoomedEpochEvents = computed(() =>
  epochEvents.value.filter(e =>
    isEpochEvent(e) &&
    e.timestamp >= zoomWindowStart.value &&
    e.timestamp <= zoomWindowEnd.value
  )
)

const zoomedParticipantEvents = computed(() =>
  participantEvents.value.filter(e =>
    isParticipantEvent(e) &&
    e.timestamp >= zoomWindowStart.value &&
    e.timestamp <= zoomWindowEnd.value
  )
)

const handleZoomedTimelineClick = async (event: MouseEvent) => {
  const clickX = getRelativeClickX(event)
  const targetTime = zoomWindowStart.value + clickX * zoomWindowDuration.value
  await jumptoTime(targetTime)
}

const TIMELINE_WIDTH = 800

// onMounted(() => {
  // play()
// })

const currentKeyPress = ref<Key | null>(null)
const currentKeyPressTime = ref(0)
const keyPressOpacity = ref(0)

const animateKeyPress = () => {
  const inTime = 60
  const outTime = 1000
  
  const elapsed = Date.now() - currentKeyPressTime.value

  const maxOp = 0.2
  if (elapsed < inTime) {
    keyPressOpacity.value = maxOp * (elapsed / inTime) ** 3
  } else {
    keyPressOpacity.value = maxOp * (1 - (elapsed - inTime) / outTime) ** 5
  }
  if (elapsed < inTime + outTime) {
    requestAnimationFrame(animateKeyPress)
  }
}
const showKeyPress = (key: Key) => {
  const keyMap = {
    UP: '↑', 
    DOWN: '↓',
    LEFT: '←', 
    RIGHT: '→',
  }
  // @ts-ignore
  currentKeyPress.value = keyMap[key] ?? key
  currentKeyPressTime.value = Date.now()
  animateKeyPress()
}

bus.on((e: PEvent) => {
  if (e.eventType === 'participant.keyPress') {
    showKeyPress(e.data.info.key)
  }
})

// for testing style
// onMounted(async () => {
//   for (const key of R.reverse(PARTICIPANT_KEYS)) {
//     await timeoutPromise(800)
//     showKeyPress(key)
//   }
// })

onKeyStroke([' ', 'enter', 'p'], (event) => {
  event.preventDefault()
  event.stopPropagation()
  togglePlayPause()
})

onKeyStroke(['n', 'ArrowRight'], (event) => {
  event.preventDefault()
  event.stopPropagation()
  next()
})

</script>

<template>
  <div class="playback-controller p-4 bg-gray-50 rounded-lg" >
    <MainContentOverlay flex-center>
      <div v-if="currentKeyPress"
        scale-200 flex-center
        w-20 h-20 rounded-lg
        text-4xl font-mono
        :style="{
          // background: `rgba(0,0,0,${keyPressOpacity * 1})`,
          // color: `rgba(255,255,255,${keyPressOpacity})`,
          opacity: keyPressOpacity,
          background: 'black',
          color: 'white',
          fontSize: (4 / currentKeyPress.length) + 'rem',
        }"
      >
        {{ currentKeyPress }}
      </div>
    </MainContentOverlay>
    <!-- Timeline -->
    <div class="timeline-container mb-4">
      <div class="timeline-header flex justify-between items-center mb-2">
        <span class="text-sm text-gray-600">Timeline</span>
        <span class="text-sm text-gray-600">
          {{ formatTime(currentTime) }} / {{ formatTime(totalDuration) }}
        </span>
      </div>
      
      <div 
        class="timeline relative h-8 bg-gray-200 cursor-pointer"
        :style="{ width: `${TIMELINE_WIDTH}px` }"
        @click="handleTimelineClick"
      >
        <!-- Zoom window indicator -->
        <div
          bg-black op7
          class="absolute h-full pointer-events-none will-change-transform"
          :style="{ 
            transform: `translateX(${round1(((zoomWindowStart / totalDuration) * TIMELINE_WIDTH))}px)`,
            width: `${(zoomWindowDuration / totalDuration) * TIMELINE_WIDTH}px` 
          }"
        />
        
        <!-- Epoch events as vertical lines -->
        <div
          v-for="(epochEvent, idx) in epochEvents"
          :key="`epoch-${idx}`"
          class="epoch-line absolute w2px h-full bg-purple-400 opacity-50 cursor-pointer"
          :style="{ transform: `translateX(${(epochEvent.timestamp / totalDuration) * TIMELINE_WIDTH - 1}px)`, top: '0' }"
          :title="`${epochEvent.eventType} (${epochEvent.data.id})`"
          @click.stop="jumpToEpochEvent(epochEvent)"
        />

        <!-- Participant event dots -->
        <div
          v-for="(event, idx) in participantEvents"
          :key="`participant-${idx}`"
          class="event-dot absolute w4px h4px rounded-full"
          :class="{
            'bg-primary-500': event.timestamp <= currentTime,
            'bg-primary': event.timestamp > currentTime
          }"
          :style="{ transform: `translate(${(event.timestamp / totalDuration) * TIMELINE_WIDTH - 2}px, -50%)`, top: '50%' }"
          :title="`Event ${idx + 1}: ${event.eventType}`"
        />
        
        <!-- Current time indicator -->
        <div
          class="current-time-indicator absolute w2px h-full bg-red-500"
          :style="{ transform: `translateX(${(currentTime / totalDuration) * TIMELINE_WIDTH - 1}px)` }"
        />
      </div>
    </div>
    
    <!-- Zoomed Timeline -->
    <div class="timeline-container mb-4">
      <div class="timeline-header flex justify-between items-center mb-2">
        <span class="text-sm text-gray-600">Zoomed (30s window)</span>
        <span class="text-sm text-gray-600">
          {{ formatTime(zoomWindowStart) }} - {{ formatTime(zoomWindowEnd) }}
        </span>
      </div>
      
      <div 
        class="timeline relative h-8 bg-gray-200 cursor-pointer"
        :style="{ width: `${TIMELINE_WIDTH}px` }"
        @click="handleZoomedTimelineClick"
      >
        <!-- Epoch events as vertical lines -->
        <div
          v-for="(epochEvent, idx) in zoomedEpochEvents"
          :key="`zoomed-epoch-${idx}`"
          class="epoch-line absolute w4px h-full bg-purple-400 opacity-50 cursor-pointer"
          :style="{ transform: `translateX(${((epochEvent.timestamp - zoomWindowStart) / zoomWindowDuration) * TIMELINE_WIDTH - 2}px)`, top: '0' }"
          :title="`${epochEvent.eventType} (${epochEvent.data.id})`"
          @click.stop="jumpToEpochEvent(epochEvent)"
        />
        
        <!-- Participant event dots -->
        <div
          v-for="(event, idx) in zoomedParticipantEvents"
          :key="`zoomed-participant-${idx}`"
          class="event-dot absolute w12px h12px rounded-full"
          :class="{
            'bg-primary-500': event.timestamp <= currentTime,
            'bg-primary': event.timestamp > currentTime
          }"
          :style="{ transform: `translate(${((event.timestamp - zoomWindowStart) / zoomWindowDuration) * TIMELINE_WIDTH - 6}px, -50%)`, top: '50%' }"
          :title="`Event ${idx + 1}: ${event.eventType}`"
        />
        
        <!-- Current time indicator -->
        <div
          class="current-time-indicator absolute w4px h-full bg-red-500"
          :style="{ transform: `translateX(${((currentTime - zoomWindowStart) / zoomWindowDuration) * TIMELINE_WIDTH - 2}px)` }"
        />
      </div>
    </div>
    
    <!-- Controls -->
    <div class="controls flex items-center justify-center gap-4">

      <div flex="~ row gap-2">
        <button
          @click="togglePlayPause"
          class="control-btn w-18 px-4 py-2 text-white rounded transition-colors"
          :class="state === 'playing' ? 'bg-orange-500 hover:bg-orange-600' : 'bg-green-500 hover:bg-green-600'"
          :disabled="currentEventIndex >= allEvents.length - 1"
        >
          {{ state === 'playing' ? 'Pause' : 'Play' }}
        </button>

        <button
          @click="next"
          class="control-btn px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
          :disabled="currentEventIndex >= allEvents.length - 1"
        >
          Next
        </button>
      </div>
      
    </div>
    
    <!-- Status info -->
    <div class="mt-3 text-center text-sm text-gray-600">
      {{ currentEpoch.id }}
    </div>
    <!-- <div class="status-info mt-3 text-center text-sm text-gray-600">
      <span v-if="allEvents.length === 0">No events to play</span>
      <span v-else-if="state === 'stopped'">Ready to play {{ allEvents.length }} events</span>
      <span v-else-if="state === 'playing'">Playing event {{ currentEventIndex + 1 }} of {{ allEvents.length }}</span>
      <span v-else-if="state === 'paused'">Paused at event {{ currentEventIndex + 1 }} of {{ allEvents.length }}</span>
    </div> -->
  </div>
</template>
