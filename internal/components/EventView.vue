<script lang="ts" setup>
import stringify from "json-stringify-pretty-compact";

type FormattedEvent = {
  eventType: string
  timestamp: number
  caption?: string
  data?: Record<string, any>
  isError?: boolean
  errorMinimal?: string
  isJumpDivider?: boolean
  cardClass?: string
}

const props = defineProps<{
  initialFilter?: string
  horizontal?: boolean
}>()

const events = reactive<FormattedEvent[]>([])
const whitelistFilter = useLocalStorage('eventView.filter', props.initialFilter ?? '')

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

// While a jump is in progress we buffer events (starting with jump.start) for
// up to JUMP_COLLAPSE_TIMEOUT_MS. If jump.success arrives, the whole buffer is
// collapsed into a single divider. If an error arrives or the timer elapses, the
// buffered events are flushed and render as usual.
const JUMP_COLLAPSE_TIMEOUT_MS = 500
let jumpBuffer: FormattedEvent[] | null = null
let jumpTimer: ReturnType<typeof setTimeout> | undefined

const flushJumpBuffer = () => {
  if (jumpTimer !== undefined) {
    clearTimeout(jumpTimer)
    jumpTimer = undefined
  }
  if (jumpBuffer === null) return
  const buffered = jumpBuffer
  jumpBuffer = null
  // buffered holds events oldest-first; unshift in order to keep newest-first.
  for (const event of buffered) events.unshift(event)
}

const collapseJumpBuffer = (timestamp: number) => {
  if (jumpTimer !== undefined) {
    clearTimeout(jumpTimer)
    jumpTimer = undefined
  }
  jumpBuffer = null
  events.unshift({
    eventType: 'jump',
    timestamp,
    isJumpDivider: true,
  })
}

const pushEvent = (event: FormattedEvent) => {
  if (jumpBuffer !== null) jumpBuffer.push(event)
  else events.unshift(event)
}

useLogEventBus().on((event) => {
  if (isEpochEvent(event)) {
    const { id, ...rest } = event.data
    const caption = typeof id === 'string' ? id : undefined
    pushEvent({
      ...event,
      caption,
      data: R.isEmpty(rest) ? undefined : rest,
    })
  }
  else if (isParticipantEvent(event)) {
    const caption = event.eventType.slice('participant.'.length)
    pushEvent({
      ...event,
      caption,
      data: R.isEmpty(event.data) ? undefined : event.data,
      cardClass: 'card-primary',
    })
  }
  else if (isErrorEvent(event)) {
    // An error during a jump ends the wait: flush buffered events, then render.
    flushJumpBuffer()
    const { message, ...rest } = event.data
    const { minimal } = formatErrorEvent({ message, ...rest })
    pushEvent({
      ...event,
      caption: message,
      data: R.isEmpty(rest) ? undefined : rest,
      isError: true,
      errorMinimal: minimal.length === 0 ? undefined : minimal,
      cardClass: 'card-red',
    })
  }
  else {
    pushEvent({
      ...event,
      data: R.isEmpty(event.data) ? undefined : event.data,
    })
  }
})

useDebugBus().on(({message, info}) => {
  if (message === 'jump.start') {
    // Begin buffering. jump.start itself is the first buffered event.
    flushJumpBuffer()
    jumpBuffer = []
    jumpTimer = setTimeout(flushJumpBuffer, JUMP_COLLAPSE_TIMEOUT_MS)
    pushEvent({
      eventType: message,
      timestamp: Date.now(),
      caption: info.epochId,
      cardClass: 'card-purple',
    })
    return
  }
  if (message === 'jump.success') {
    if (jumpBuffer !== null) collapseJumpBuffer(Date.now())
    return
  }
  if (message.startsWith('jump.')) {
    pushEvent({
      eventType: message,
      timestamp: Date.now(),
      caption: info.epochId,
      cardClass: 'card-purple',
    })
    return
  }
  pushEvent({
    eventType: message,
    timestamp: Date.now(),
    data: info,
    cardClass: 'card-purple',
  })
})


const eventFilters: Record<string, (eventType: string) => boolean> = {
  epoch: (t) => t.startsWith('epoch'),
  participant: (t) => t.startsWith('participant'),
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
  timestamp -= START_TIME
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
const { width: mainContentWidth } = useElementSize(mainContentRef)
const horizontalWidth = computed(() => {
  const measured = Math.floor(mainContentWidth.value || 0)
  return Math.max(800, measured)
})
const horizontalScrollEl = ref<HTMLElement | null>(null)

const normalizeWheelDelta = (delta: number, mode: number, viewportWidth: number) => {
  if (mode === 1) return delta * 16
  if (mode === 2) return delta * viewportWidth
  return delta
}

const onHorizontalWheel = (event: WheelEvent) => {
  const el = horizontalScrollEl.value
  if (!el || el.scrollWidth <= el.clientWidth) return

  const deltaY = normalizeWheelDelta(event.deltaY, event.deltaMode, el.clientWidth)
  const deltaX = normalizeWheelDelta(event.deltaX, event.deltaMode, el.clientWidth)
  if (deltaY === 0 && deltaX === 0) return

  event.preventDefault()
  el.scrollLeft += deltaY + deltaX
}

const openDataPopoverKey = ref<string | null>(null)
const previewBoxEls = new Map<string, HTMLElement>()
const previewOverflowByKey = ref<Record<string, boolean>>({})
let measureRaf = 0
const centeredDataPopoverStyle = {
  position: 'fixed',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  maxWidth: 'min(96vw, 1200px)',
  maxHeight: '80vh',
} as const

const getPopoverKey = (event: FormattedEvent, index: number) => `${event.timestamp}-${index}`

const toggleDataPopover = (key: string) => {
  if (openDataPopoverKey.value === key) {
    closeDataPopover()
    return
  }
  openDataPopoverKey.value = key
}

const closeDataPopover = () => {
  openDataPopoverKey.value = null
}

const setPreviewBoxEl = (key: string, el: unknown | null) => {
  if (el instanceof HTMLElement) {
    previewBoxEls.set(key, el)
  }
  else {
    previewBoxEls.delete(key)
  }
  queueMeasurePreviewOverflow()
}

const hasPreviewOverflow = (key: string) => previewOverflowByKey.value[key] === true
const shouldShowPreviewBox = (key: string) => previewOverflowByKey.value[key] !== false
const formatOverflowPreview = (value: unknown) => formatForPre(value, Number.MAX_SAFE_INTEGER)

const measurePreviewOverflow = () => {
  const validKeys = new Set(filteredEvents.value.map((event, index) => getPopoverKey(event, index)))

  for (const key of Object.keys(previewOverflowByKey.value)) {
    if (!validKeys.has(key)) {
      delete previewOverflowByKey.value[key]
    }
  }
  for (const key of [...previewBoxEls.keys()]) {
    if (!validKeys.has(key)) {
      previewBoxEls.delete(key)
    }
  }

  for (const [key, el] of previewBoxEls) {
    const hasOverflow = el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1
    if (previewOverflowByKey.value[key] !== hasOverflow) {
      previewOverflowByKey.value[key] = hasOverflow
      if (!hasOverflow && openDataPopoverKey.value === key) {
        closeDataPopover()
      }
    }
  }
}

const queueMeasurePreviewOverflow = () => {
  if (measureRaf !== 0) return
  measureRaf = requestAnimationFrame(() => {
    measureRaf = 0
    measurePreviewOverflow()
  })
}

onMounted(() => {
  const onPointerDown = (event: PointerEvent) => {
    const key = openDataPopoverKey.value
    if (!key) return
    const target = event.target as HTMLElement | null
    if (!target) {
      closeDataPopover()
      return
    }
    if (target.closest(`[data-data-popover="${key}"]`)) return
    closeDataPopover()
  }

  window.addEventListener('pointerdown', onPointerDown)
  queueMeasurePreviewOverflow()
  onUnmounted(() => {
    window.removeEventListener('pointerdown', onPointerDown)
    if (measureRaf !== 0) {
      cancelAnimationFrame(measureRaf)
      measureRaf = 0
    }
    if (jumpTimer !== undefined) {
      clearTimeout(jumpTimer)
      jumpTimer = undefined
    }
  })
})

watch([horizontalWidth, eventViewHeight], () => {
  previewOverflowByKey.value = {}
  queueMeasurePreviewOverflow()
})

onUpdated(() => {
  queueMeasurePreviewOverflow()
})

</script>

<template>
  <div
    v-if="isHorizontal"
    bg-gray-100
    p-2
    text-sm
    rounded-lg
    min-w="800px"
    :style="{ width: `${horizontalWidth}px` }"
    min-h="200px"
    max-h="300px"
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
      <IconButton icon="i-mdi-broom" title="Clear" @click="events.length = 0" />
    </div>
    <div
      ref="horizontalScrollEl"
      class="subtle-scrollbar flex-1 min-h-0 min-w-0"
      flex="~ row gap-2"
      items-start
      overflow-x-auto
      overflow-y-hidden
      pb-1
      @wheel="onHorizontalWheel"
    >
      <template v-for="(event, index) in filteredEvents" :key="`${event.timestamp}-${index}`">
        <div v-if="event.isJumpDivider" flex="~ row items-center justify-center" w="260px" min-w="260px" h-full opacity-50 text-xs font-bold>
          ────── jump ──────
        </div>
        <template v-else>
        <template v-if="event.data !== undefined">
          <Teleport to="body">
            <div
              v-if="openDataPopoverKey === getPopoverKey(event, index) && hasPreviewOverflow(getPopoverKey(event, index))"
              :data-data-popover="getPopoverKey(event, index)"
              z-60
              rounded-md
              border="~ gray-300"
              bg-white
              p-2
              shadow-lg
              overflow-auto
              :style="centeredDataPopoverStyle"
            >
              <pre text-xs class="whitespace-pre-wrap break-words">{{ formatForPre(event.data, 140) }}</pre>
            </div>
          </Teleport>
        </template>
        <div :class="event.cardClass ?? 'card-gray'" p-2 rounded-md relative w="260px" min-w="260px" h-full>
          <span font-bold>{{ event.eventType }}</span>
          <div text-right absolute top-2 right-2>
            <span text-xs opacity-50>{{ fmtTimestamp(event.timestamp) }}</span>
          </div>
          <div v-if="event.caption" text-xs opacity-50>{{ event.caption }}</div>
          <template v-if="event.isError">
            <pre v-if="event.errorMinimal !== undefined" text-xs>{{ event.errorMinimal }}</pre>
          </template>
          <template v-else-if="event.data !== undefined">
            <div :data-data-popover="getPopoverKey(event, index)" relative mt-1>
              <template v-if="shouldShowPreviewBox(getPopoverKey(event, index))">
                <div
                  :ref="(el) => setPreviewBoxEl(getPopoverKey(event, index), el)"
                  rounded-md
                  border="~ gray-300"
                  class="bg-white/70"
                  h="110px"
                  overflow-hidden
                  pr-7
                >
                  <pre p-2 text-8px class="whitespace-pre-wrap break-words overflow-hidden line-height-snug ">{{ formatOverflowPreview(event.data) }}</pre>
                </div>
                <button
                  v-if="hasPreviewOverflow(getPopoverKey(event, index))"
                  absolute
                  top-1
                  right-1
                  w-5
                  h-5
                  rounded
                  bg-gray-200
                  hover:bg-gray-300
                  flex-center
                  @click.stop="toggleDataPopover(getPopoverKey(event, index))"
                  title="Show full data"
                >
                  <span i-mdi-open-in-new text-xs />
                </button>
              </template>
              <pre v-else text-xs class="whitespace-pre-wrap break-words">{{ formatForPre(event.data, 54) }}</pre>
            </div>
          </template>
        </div>
        </template>
      </template>
    </div>
  </div>

  <div
    v-else
    border="~ 2 gray-300"
    p-2
    text-sm
    rounded-lg
    min-w="300px"
    flex="~ col"
    relative
    :style="{ height: `${eventViewHeight}px` }"
    ref="top-div"
  >
    <div flex="~ col gap-1" mb-2>
      <h2 shrink-0>Events</h2>
      <div flex="~ row items-center gap-3" text-xs>
        <label v-for="(ref, name) in showFilters" :key="name">
          <input type="checkbox" v-model="ref.value"> {{ name }}
        </label>
      </div>
      <TextFilter v-model="whitelistFilter" placeholder="e.g. !epoch *.trial" w-52 />
      <!-- <button r1 t1 ml-auto btn-gray btn-xs @click="events.length = 0">clear</button> -->
      <IconButton absolute right-1 top-1 icon="i-mdi-broom" title="Clear" @click="events.length = 0" />
    </div>
    <div class="subtle-scrollbar flex-1 min-h-0" flex="~ col gap-2" overflow-y-auto>
      <template v-for="(event, index) in filteredEvents" :key="`${event.timestamp}-${index}`">
        <div v-if="event.isJumpDivider" flex="~ row items-center justify-center" my-1 opacity-50 text-xs font-bold>
          ────── jump ──────
        </div>
        <template v-else>
        <template v-if="event.data !== undefined">
          <Teleport to="body">
            <div
              v-if="openDataPopoverKey === getPopoverKey(event, index) && hasPreviewOverflow(getPopoverKey(event, index))"
              :data-data-popover="getPopoverKey(event, index)"
              z-60
              rounded-md
              border="~ gray-300"
              bg-white
              p-2
              shadow-lg
              overflow-auto
              :style="centeredDataPopoverStyle"
            >
              <pre text-xs class="whitespace-pre-wrap break-words">{{ formatForPre(event.data, 100) }}</pre>
            </div>
          </Teleport>
        </template>
        <div :class="event.cardClass ?? 'card-gray'" p-2 mr-1 rounded-md relative>
          <span font-bold>{{ event.eventType }}</span>
          <div text-right absolute top-2 right-2>
            <span text-xs opacity-50>{{ fmtTimestamp(event.timestamp) }}</span>
          </div>
          <div v-if="event.caption" text-xs opacity-50>{{ event.caption }}</div>
          <template v-if="event.isError">
            <pre v-if="event.errorMinimal !== undefined" text-xs>{{ event.errorMinimal }}</pre>
          </template>
          <template v-else-if="event.data !== undefined">
            <div :data-data-popover="getPopoverKey(event, index)" relative mt-1>
              <template v-if="shouldShowPreviewBox(getPopoverKey(event, index))">
                <div
                  :ref="(el) => setPreviewBoxEl(getPopoverKey(event, index), el)"
                  rounded-md
                  border="~ gray-300"
                  class="bg-white/70"
                  h="110px"
                  overflow-hidden
                  pr-7
                >
                  <pre p-2 text-8px class="whitespace-pre-wrap break-words overflow-hidden line-height-snug ">{{ formatOverflowPreview(event.data) }}</pre>
                </div>
                <button
                  v-if="hasPreviewOverflow(getPopoverKey(event, index))"
                  absolute
                  top-1
                  right-1
                  w-5
                  h-5
                  rounded
                  bg-gray-200
                  hover:bg-gray-300
                  flex-center
                  @click.stop="toggleDataPopover(getPopoverKey(event, index))"
                  title="Show full data"
                >
                  <span i-mdi-open-in-new text-xs />
                </button>
              </template>
              <pre v-else text-xs class="whitespace-pre-wrap break-words">{{ formatForPre(event.data, 72) }}</pre>
            </div>
          </template>
        </div>
        </template>
      </template>
    </div>
  </div>
</template>
