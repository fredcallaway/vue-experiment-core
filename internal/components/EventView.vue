<script lang="ts" setup>

type FormattedEvent = {
  eventType: string
  timestamp: number
  caption?: string
  data?: Record<string, any>
  cardClass?: string
}

const props = defineProps<{
  initialFilter?: string
}>()

const events = reactive<FormattedEvent[]>([])
const whitelistFilter = ref(props.initialFilter ?? '')
const startTime = ref(START_TIME)

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
    events.unshift({
      ...event,
      caption: message,
      data: rest,
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
  return events.filter(({eventType}) => eventFilter(eventType))
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
    <TextFilter v-model="whitelistFilter" placeholder="e.g. !epoch" mb-2 />
    <div flex="~ col gap-2" overflow-y-auto class="subtle-scrollbar">
      <template v-for="{eventType, timestamp, caption, data, cardClass} in filteredEvents" :key="timestamp">
        <div :class="cardClass ?? 'card-gray'" p-2 mr-1 rounded-md relative>
          <span font-bold>{{ eventType }}</span>
          <div text-right absolute top-2 right-2>
            <span text-xs opacity-50>{{ fmtTimestamp(timestamp) }}</span>
          </div>
          <div v-if="caption" text-xs  opacity-50>{{ caption }}</div>
          <pre v-if="data !== undefined" text-xs>{{ data }}</pre>
        </div>
      </template>
    </div>
  </div>
</template>

