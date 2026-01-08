<script lang="ts" setup>
import stringify from "json-stringify-pretty-compact";

type FormattedEvent = {
  eventType: string
  timestamp: number
  caption?: string
  data?: Record<string, any>
  isError?: boolean
  errorMinimal?: string
  cardClass?: string
}

const props = defineProps<{
  initialFilter?: string
}>()

const events = reactive<FormattedEvent[]>([])
const whitelistFilter = useLocalStorage('eventView.filter', props.initialFilter ?? '')
const startTime = ref(START_TIME)
const showParticipant = useLocalStorage('eventView.showParticipant', true)
const showEpoch = useLocalStorage('eventView.showEpoch', true)

const normalizeNewlines = (s: string) => s.replaceAll('\\n', '\n')
const formatForPre = (value: unknown) => {
  if (typeof value === 'string') return normalizeNewlines(value)
  return stringify(value, { indent: 2 })
}

const formatErrorEvent = (data: Record<string, any>) => {
  const { cause, info, stack, ...rest } = data
  if (stack !== undefined && typeof stack !== 'string') {
    throw new Error(`Error event stack must be a string; got ${typeof stack}`)
  }
  const normalizedStack = stack === undefined ? undefined : normalizeNewlines(stack)
  const headline =
    normalizedStack
      ?.split('\n')
      .map((l) => l.trimEnd())
      .find((l) => l.trim().length > 0)
    ?? (typeof rest.message === 'string'
      ? rest.message
      : typeof data.message === 'string'
        ? data.message
        : undefined)

  const firstFrame =
    normalizedStack
      ?.split('\n')
      .map((l) => l.trimEnd())
      .find((l) => /^\s*at\s+/.test(l))

  const m = firstFrame?.match(/^\s*at\s+(?<fn>.*?)\s+\(/)
  const fn = m?.groups?.fn

  return {
    minimal: [headline, fn ? `   at ${fn} (see console for details)` : undefined]
      .filter((x): x is string => x !== undefined && x.length > 0)
      .join('\n'),
  }
}

useLogEventBus().on((event) => {
  const { eventType, timestamp, data } = event
  if (eventType == 'epoch.start.experiment') {
    startTime.value = timestamp
  }
  if (isEpochEvent(event)) {
    const { id, ...rest } = data
    const caption = typeof id === 'string' ? id : undefined
    events.unshift({
      ...event,
      caption,
      data: R.isEmpty(rest) ? undefined : rest,
    })
  } 
  else if (isParticipantEvent(event)) {
    const { pid, info } = event.data
    events.unshift({
      ...event,
      caption: pid,
      data: R.isEmpty(info) ? undefined : info,
      cardClass: 'card-primary',
    })
  }
  else if (isErrorEvent(event)) {
    const { message, ...rest } = event.data
    const { minimal } = formatErrorEvent({ message, ...rest })
    events.unshift({
      ...event,
      caption: message,
      data: R.isEmpty(rest) ? undefined : rest,
      isError: true,
      errorMinimal: minimal.length === 0 ? undefined : minimal,
      cardClass: 'card-red',
    })
  }
  else {
    events.unshift({
      ...event,
      data: R.isEmpty(data) ? undefined : data,
    })
  }
})

useDebugBus().on(({message, info}) => {
  events.unshift({
    eventType: message,
    timestamp: Date.now(),
    data: info,
    cardClass: 'card-purple',
  })
})


const filteredEvents = computed(() => {
  const eventFilter = createTextFilter(whitelistFilter.value)
  return events.filter(({eventType}) => 
    eventFilter(eventType)
    && (showParticipant.value || !eventType.startsWith('participant'))
    && (showEpoch.value || !eventType.startsWith('epoch'))
  )
})

const fmtTimestamp = (timestamp: number) => {
  timestamp -= startTime.value
  const totalMs = timestamp
  const totalSeconds = Math.floor(totalMs / 1000)
  const ms = totalMs % 1000
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`
}


// calculating height
const { height: winHeight } = useWindowSize()
const { top } = useElementBounding(useTemplateRef('top-div'))
const { scale } = useSizeScale()
const eventViewHeight = computed(() => {
  const usedSpace = (top.value + 10) * scale.value + 20
  return (winHeight.value - usedSpace) / scale.value
})

</script>

<template>
  <div bg-gray-100 p-2 text-sm rounded-lg min-w="300px" flex="~ col" relative 
    :style="{ height: `${eventViewHeight}px` }" 
    ref="top-div"
  >
    <h2>Events</h2>
    <button absolute right-2 top-2 btn-gray btn-xs @click="events.length = 0">clear</button>
    <div flex gap-4 mb-1>
      <label><input type="checkbox" v-model="showParticipant"> participant</label>
      <label><input type="checkbox" v-model="showEpoch"> epoch</label>
    </div>
    <TextFilter v-model="whitelistFilter" placeholder="e.g. !epoch" mb-2 />
    <div flex="~ col gap-2" overflow-y-auto class="subtle-scrollbar">
      <template v-for="event in filteredEvents" :key="event.timestamp">
        <div :class="event.cardClass ?? 'card-gray'" p-2 mr-1 rounded-md relative>
          <span font-bold>{{ event.eventType }}</span>
          <div text-right absolute top-2 right-2>
            <span text-xs opacity-50>{{ fmtTimestamp(event.timestamp) }}</span>
          </div>
          <div v-if="event.caption" text-xs opacity-50>{{ event.caption }}</div>
          <template v-if="event.isError">
            <pre v-if="event.errorMinimal !== undefined" text-xs>{{ event.errorMinimal }}</pre>
          </template>
          <pre v-else-if="event.data !== undefined" text-xs>{{ stringify(event.data, { indent: 2 }) }}</pre>
        </div>
      </template>
    </div>
  </div>
</template>

