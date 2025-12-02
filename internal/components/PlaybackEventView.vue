<script lang="ts" setup>

type FormattedEvent = {
  eventType: string
  timestamp: number
  caption?: string
  data?: Record<string, any>
  cardClass?: string
}

const whitelistFilter = ref('')

const { state, currentEventIndex, currentTime, events } = usePlaybackState()

const formatEvent = (event: LogEvent): FormattedEvent => {
  const { eventType, timestamp, data } = event
  if (eventType.startsWith('epoch.')) {
    const { id, ...rest } = data
    const caption = typeof id === 'string' ? id : undefined
    return ({
      ...event,
      caption,
      data: rest,
    })
  } else if (eventType.startsWith('debug.')) {
    return ({
      ...event,
      cardClass: 'card-purple',
    })
  } else if (eventType.startsWith('participant.')) {
    const { pid, info } = (event as PEvent).data
    return ({
      ...event,
      caption: pid,
      data: info,
      cardClass: 'card-primary',
    })
  }
  else {
    return (event)
  }
}

const formattedEvents = computed(() => {
  return R.reverse(events.value).map(formatEvent)
})

const filteredEvents = computed(() => {
  const eventFilter = createTextFilter(whitelistFilter.value)
  return formattedEvents.value.filter((e) => eventFilter(e.eventType) && e.timestamp <= currentTime.value )
})

const fmtTimestamp = (timestamp: number) => {
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
    <h2>Data Events</h2>
    <button absolute right-2 top-2 btn-gray btn-xs @click="formattedEvents.length = 0">clear</button>
    <TextFilter v-model="whitelistFilter" placeholder="e.g. !epoch" mb-2 />
    <div flex="~ col gap-2" overflow-y-auto class="subtle-scrollbar">
      <template v-for="{eventType, timestamp, caption, data, cardClass} in filteredEvents" :key="timestamp">
        <div :class="cardClass ?? 'card-gray'" p-2 mr-1 rounded-md relative>
          <span font-bold>{{ eventType }}</span>
          <div text-right absolute top-2 right-2>
            <span text-xs opacity-50>{{ fmtTimestamp(timestamp) }}</span>
          </div>
          <div v-if="caption" text-xs  opacity-50>{{ caption }}</div>
          <pre v-if="data && Object.keys(data).length > 0" text-xs>{{ data }}</pre>
        </div>
      </template>
    </div>
  </div>
</template>

