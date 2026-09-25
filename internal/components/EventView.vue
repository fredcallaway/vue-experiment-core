<script lang="ts" setup>
import { useDebugBus, useLogEventBus } from '../../composables/logEvent'
import { createTextFilter } from '../../utils/createTextFilter'
import { START_TIME, mainContentRef } from '../state'
import * as R from 'remeda'
import { useSizeScale } from '../composables/useSizeScale'
import { isEpochEvent, isErrorEvent, isParticipantEvent } from '../data'
import { useElementBounding, useElementSize, useLocalStorage, useWindowSize } from '@vueuse/core'

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
      cardClass: 'p-4 rounded-lg bg-primary-200 text-primary-600 [&>h3]:text-primary-700',
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
      cardClass: 'p-4 rounded-lg bg-red-200 text-red-600 [&>h3]:text-red-700',
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
      cardClass: 'p-4 rounded-lg bg-purple-200 text-purple-600 [&>h3]:text-purple-700',
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
      cardClass: 'p-4 rounded-lg bg-purple-200 text-purple-600 [&>h3]:text-purple-700',
    })
    return
  }
  pushEvent({
    eventType: message,
    timestamp: Date.now(),
    data: info,
    cardClass: 'p-4 rounded-lg bg-purple-200 text-purple-600 [&>h3]:text-purple-700',
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
    class="bg-gray-100 p-2 text-sm rounded-lg min-w-800px min-h-200px max-h-300px flex flex-col relative"
    v-if="isHorizontal"
    :style="{ width: `${horizontalWidth}px` }"
  >
    <div class="flex flex-row flex-items-center flex-gap-3 flex-wrap mb-2">
      <h2 class="shrink-0">Events</h2>
      <TextFilter class="w-64" v-model="whitelistFilter" placeholder="Filter: e.g. !epoch *.trial" compact />
      <div class="flex flex-row flex-items-center flex-gap-3 text-xs">
        <label v-for="(ref, name) in showFilters" :key="name">
          <input type="checkbox" v-model="ref.value"> {{ name }}
        </label>
      </div>
      <IconButton icon="i-mdi-broom" title="Clear" @click="events.length = 0" />
    </div>
    <div
      ref="horizontalScrollEl"
      class="[scrollbar-gutter:stable] [scrollbar-width:thin] [scrollbar-color:rgba(0,0,0,0.2)_transparent] flex-1 min-h-0 min-w-0 flex flex-row flex-gap-2 items-start overflow-x-auto overflow-y-hidden pb-1"
      @wheel="onHorizontalWheel"
    >
      <template v-for="(event, index) in filteredEvents" :key="`${event.timestamp}-${index}`">
        <div
          class="flex flex-row flex-items-center flex-justify-center w-260px min-w-260px h-full opacity-50 text-xs font-bold"
          v-if="event.isJumpDivider"
        >
          ────── jump ──────
        </div>
        <template v-else>
        <template v-if="event.data !== undefined">
          <Teleport to="body">
            <div
              class="z-60 rounded-md border border-gray-300 bg-white p-2 shadow-lg overflow-auto"
              v-if="openDataPopoverKey === getPopoverKey(event, index) && hasPreviewOverflow(getPopoverKey(event, index))"
              :data-data-popover="getPopoverKey(event, index)"
              :style="centeredDataPopoverStyle"
            >
              <pre class="whitespace-pre-wrap break-words text-xs">{{ formatForPre(event.data, 140) }}</pre>
            </div>
          </Teleport>
        </template>
        <div
          class="p-2 rounded-md relative w-260px min-w-260px h-full"
          :class="event.cardClass ?? 'p-4 rounded-lg bg-gray-200 text-gray-600 [&>h3]:text-gray-700'"
        >
          <span class="font-bold">{{ event.eventType }}</span>
          <div class="text-right absolute top-2 right-2">
            <span class="text-xs opacity-50">{{ fmtTimestamp(event.timestamp) }}</span>
          </div>
          <div class="text-xs opacity-50" v-if="event.caption">{{ event.caption }}</div>
          <template v-if="event.isError">
            <pre class="text-xs" v-if="event.errorMinimal !== undefined">{{ event.errorMinimal }}</pre>
          </template>
          <template v-else-if="event.data !== undefined">
            <div class="relative mt-1" :data-data-popover="getPopoverKey(event, index)">
              <template v-if="shouldShowPreviewBox(getPopoverKey(event, index))">
                <div
                  :ref="(el) => setPreviewBoxEl(getPopoverKey(event, index), el)"
                  class="bg-white/70 rounded-md border border-gray-300 h-110px overflow-hidden pr-7"
                >
                  <pre class="whitespace-pre-wrap break-words overflow-hidden line-height-snug p-2 text-8px">{{ formatOverflowPreview(event.data) }}</pre>
                </div>
                <button
                  class="absolute top-1 right-1 w-5 h-5 rounded bg-gray-200 hover:bg-gray-300 flex flex-wrap justify-center items-center"
                  v-if="hasPreviewOverflow(getPopoverKey(event, index))"
                  @click.stop="toggleDataPopover(getPopoverKey(event, index))"
                  title="Show full data"
                >
                  <span class="i-mdi-open-in-new text-xs" />
                </button>
              </template>
              <pre v-else class="whitespace-pre-wrap break-words text-xs">{{ formatForPre(event.data, 54) }}</pre>
            </div>
          </template>
        </div>
        </template>
      </template>
    </div>
  </div>

  <div
    class="border border-2 border-gray-300 p-2 text-sm rounded-lg min-w-300px flex flex-col relative"
    v-else
    :style="{ height: `${eventViewHeight}px` }"
    ref="top-div"
  >
    <div class="flex flex-col flex-gap-1 mb-2">
      <h2 class="shrink-0">Events</h2>
      <div class="flex flex-row flex-items-center flex-gap-3 text-xs">
        <label v-for="(ref, name) in showFilters" :key="name">
          <input type="checkbox" v-model="ref.value"> {{ name }}
        </label>
      </div>
      <TextFilter class="w-52" v-model="whitelistFilter" placeholder="e.g. !epoch *.trial" />
      <!-- <button r1 t1 ml-auto btn-gray btn-xs @click="events.length = 0">clear</button> -->
      <IconButton class="absolute right-1 top-1" icon="i-mdi-broom" title="Clear" @click="events.length = 0" />
    </div>
    <div
      class="[scrollbar-gutter:stable] [scrollbar-width:thin] [scrollbar-color:rgba(0,0,0,0.2)_transparent] flex-1 min-h-0 flex flex-col flex-gap-2 overflow-y-auto"
    >
      <template v-for="(event, index) in filteredEvents" :key="`${event.timestamp}-${index}`">
        <div
          class="flex flex-row flex-items-center flex-justify-center my-1 opacity-50 text-xs font-bold"
          v-if="event.isJumpDivider"
        >
          ────── jump ──────
        </div>
        <template v-else>
        <template v-if="event.data !== undefined">
          <Teleport to="body">
            <div
              class="z-60 rounded-md border border-gray-300 bg-white p-2 shadow-lg overflow-auto"
              v-if="openDataPopoverKey === getPopoverKey(event, index) && hasPreviewOverflow(getPopoverKey(event, index))"
              :data-data-popover="getPopoverKey(event, index)"
              :style="centeredDataPopoverStyle"
            >
              <pre class="whitespace-pre-wrap break-words text-xs">{{ formatForPre(event.data, 100) }}</pre>
            </div>
          </Teleport>
        </template>
        <div
          class="p-2 mr-1 rounded-md relative"
          :class="event.cardClass ?? 'p-4 rounded-lg bg-gray-200 text-gray-600 [&>h3]:text-gray-700'"
        >
          <span class="font-bold">{{ event.eventType }}</span>
          <div class="text-right absolute top-2 right-2">
            <span class="text-xs opacity-50">{{ fmtTimestamp(event.timestamp) }}</span>
          </div>
          <div class="text-xs opacity-50" v-if="event.caption">{{ event.caption }}</div>
          <template v-if="event.isError">
            <pre class="text-xs" v-if="event.errorMinimal !== undefined">{{ event.errorMinimal }}</pre>
          </template>
          <template v-else-if="event.data !== undefined">
            <div class="relative mt-1" :data-data-popover="getPopoverKey(event, index)">
              <template v-if="shouldShowPreviewBox(getPopoverKey(event, index))">
                <div
                  :ref="(el) => setPreviewBoxEl(getPopoverKey(event, index), el)"
                  class="bg-white/70 rounded-md border border-gray-300 h-110px overflow-hidden pr-7"
                >
                  <pre class="whitespace-pre-wrap break-words overflow-hidden line-height-snug p-2 text-8px">{{ formatOverflowPreview(event.data) }}</pre>
                </div>
                <button
                  class="absolute top-1 right-1 w-5 h-5 rounded bg-gray-200 hover:bg-gray-300 flex flex-wrap justify-center items-center"
                  v-if="hasPreviewOverflow(getPopoverKey(event, index))"
                  @click.stop="toggleDataPopover(getPopoverKey(event, index))"
                  title="Show full data"
                >
                  <span class="i-mdi-open-in-new text-xs" />
                </button>
              </template>
              <pre v-else class="whitespace-pre-wrap break-words text-xs">{{ formatForPre(event.data, 72) }}</pre>
            </div>
          </template>
        </div>
        </template>
      </template>
    </div>
  </div>
</template>
