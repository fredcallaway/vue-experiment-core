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
  horizontal?: boolean
}>()

const events = reactive<FormattedEvent[]>([])
const whitelistFilter = useLocalStorage('eventView.filter', props.initialFilter ?? '')
const startTime = ref(START_TIME)

const normalizeNewlines = (s: string) => s.replaceAll('\\n', '\n')
const formatForPre = (value: unknown, maxLength = 80) => {
  if (typeof value === 'string') return normalizeNewlines(value)
  return stringify(value, { indent: 2, maxLength })
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
  if (message == '__JUMP_SUCCEEDED__') {
    events.length = 1
    events.push({
      eventType: 'jumped to epoch',
      timestamp: Date.now(),
      caption: info.epochId,
      cardClass: 'card-purple',
    })
    return
  }
  events.unshift({
    eventType: message,
    timestamp: Date.now(),
    data: info,
    cardClass: 'card-purple',
  })
})


const eventFilters: Record<string, (eventType: string) => boolean> = {
  participant: (t) => t.startsWith('participant'),
  epoch: (t) => t.startsWith('epoch'),
  hover: (t) => ['participant.hover', 'participant.mousedown'].includes(t),
}

const showFilters = R.mapValues(eventFilters, (_, name) => 
  useLocalStorage(`eventView.show.${name}`, true)
)

const filteredEvents = computed(() => {
  const textFilter = createTextFilter(whitelistFilter.value)
  return events.filter(({eventType}) => 
    textFilter(eventType)
    && Object.entries(eventFilters).every(([name, matches]) => 
      showFilters[name].value || !matches(eventType)
    )
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

const isHorizontal = computed(() => props.horizontal ?? false)

</script>

<template>
  <div
    v-if="isHorizontal"
    bg-gray-100
    p-2
    text-sm
    rounded-lg
    min-w="800px"
    min-h="200px"
    max-h="400px"
    flex="~ col"
    relative
  >
    <div flex="~ row items-center gap-3 wrap" mb-2>
      <h2 shrink-0>Events</h2>
      <TextFilter v-model="whitelistFilter" placeholder="Filter: e.g. !epoch *.trial" w-64 compact />
      <div flex="~ row items-center gap-3" text-xs>
        <label v-for="(ref, name) in showFilters" :key="name">
          <input type="checkbox" v-model="ref.value"> {{ name }}
        </label>
      </div>
      <button ml-auto btn-gray btn-xs @click="events.length = 0">clear</button>
    </div>
    <div class="subtle-scrollbar flex-1 min-h-0 min-w-0" flex="~ row gap-2" items-start overflow-x-auto overflow-y-hidden pb-1>
      <template v-for="event in filteredEvents" :key="event.timestamp">
        <div :class="event.cardClass ?? 'card-gray'" p-2 rounded-md relative w="260px" min-w="260px" h-full overflow-y-auto>
          <span font-bold>{{ event.eventType }}</span>
          <div text-right absolute top-2 right-2>
            <span text-xs opacity-50>{{ fmtTimestamp(event.timestamp) }}</span>
          </div>
          <div v-if="event.caption" text-xs opacity-50>{{ event.caption }}</div>
          <template v-if="event.isError">
            <pre v-if="event.errorMinimal !== undefined" text-xs>{{ event.errorMinimal }}</pre>
          </template>
          <pre v-else-if="event.data !== undefined" text-xs>{{ formatForPre(event.data, 54) }}</pre>
        </div>
      </template>
    </div>
  </div>

  <div
    v-else
    bg-gray-100
    p-2
    text-sm
    rounded-lg
    min-w="300px"
    flex="~ col"
    relative
    :style="{ height: `${eventViewHeight}px` }"
    ref="top-div"
  >
    <div flex="~ row items-center gap-3 wrap" mb-2>
      <h2 shrink-0>Events</h2>
      <div flex="~ row items-center gap-3" text-xs>
        <label v-for="(ref, name) in showFilters" :key="name">
          <input type="checkbox" v-model="ref.value"> {{ name }}
        </label>
      </div>
      <TextFilter v-model="whitelistFilter" placeholder="e.g. !epoch *.trial" w-52 />
      <button ml-auto btn-gray btn-xs @click="events.length = 0">clear</button>
    </div>
    <div class="subtle-scrollbar flex-1 min-h-0" flex="~ col gap-2" overflow-y-auto>
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
          <pre v-else-if="event.data !== undefined" text-xs>{{ formatForPre(event.data, 72) }}</pre>
        </div>
      </template>
    </div>
  </div>
</template>
