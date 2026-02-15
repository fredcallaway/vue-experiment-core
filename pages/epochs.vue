<script lang="ts" setup>
import type { Epoch, IndexableEpoch, PhaseEpoch } from '../composables/useEpoch'

definePageMeta({
  layout: 'bare',
})

const currentEpoch = useCurrentEpoch()
const meta = useCurrentSession()
const params = parseUrlParams()

if (params.sessionId || params.mode) {
  if (params.mode === 'live') {
    console.error('refusing to initialize session in live mode on /dev/epochs')
    meta.mode = 'debug'
  }

  useDataWriter().initializeSession(meta).then((initError) => {
    if (initError instanceof Error) {
      logError('Failed to initialize data writer; check firebase.config.json', initError)
    }
  })
}

const isIndexableEpoch = (epoch: Epoch): epoch is IndexableEpoch => {
  return 'step' in epoch && 'nSteps' in epoch && 'prev' in epoch && 'goTo' in epoch
}

const isPhaseEpoch = (epoch: Epoch): epoch is PhaseEpoch => {
  return 'phase' in epoch
}

type EpochTreeNode = {
  token: string
  prefix: string
  count: number
  children: Record<string, EpochTreeNode>
}

type GanttBar = {
  token: string
  prefix: string
  depth: number
  leftPct: number
  widthPct: number
  count: number
  childCount: number
  hiddenChildCount: number
}

const rootNode = ref<EpochTreeNode>({
  token: '__ROOT__',
  prefix: '',
  count: 0,
  children: {},
})

const isBuilding = ref(false)
const error = ref<string | null>(null)
const hasBuilt = ref(false)
const processedJumpCount = ref(0)
const discoveredJumpCount = ref(0)
const visitedEpochIds = ref(0)

const displayRootPrefix = ref('')

const BAR_HEIGHT = 28
const BAR_GAP = 6
const MIN_CHILD_WIDTH_PX = 50

const chartViewportEl = ref<HTMLElement | null>(null)
const chartWidthPx = ref(1000)

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const sortTokens = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true })

const getStack = (): Epoch[] => {
  const stack: Epoch[] = []
  let epoch = currentEpoch.value
  while (epoch) {
    const skip = epoch.isLeaf || epoch._name === '__TOP_EPOCH__'
    if (!skip) {
      stack.push(epoch)
    }
    epoch = epoch._parent
  }
  return stack.reverse()
}

const indexPrefix = (epochId: string) => {
  const bracketIndex = epochId.lastIndexOf(']')
  if (bracketIndex === -1) return epochId
  return epochId.slice(0, bracketIndex + 1)
}

const addEpochIdToTree = (epochId: string) => {
  const tokens = epochId.split('-').filter(Boolean)
  let node = rootNode.value
  let prefix = ''

  for (const token of tokens) {
    prefix = prefix ? `${prefix}-${token}` : token

    if (!node.children[token]) {
      node.children[token] = {
        token,
        prefix,
        count: 0,
        children: {},
      }
    }

    node = node.children[token]
    node.count += 1
  }
}

const resetTree = () => {
  rootNode.value = {
    token: '__ROOT__',
    prefix: '',
    count: 0,
    children: {},
  }
  processedJumpCount.value = 0
  discoveredJumpCount.value = 0
  visitedEpochIds.value = 0
  hasBuilt.value = false
  error.value = null
  displayRootPrefix.value = ''
}

const sortedChildren = (node: EpochTreeNode) =>
  Object.values(node.children).sort((a, b) => sortTokens(a.token, b.token))

const nodeByPrefix = computed(() => {
  const map = new Map<string, EpochTreeNode>()

  const walk = (node: EpochTreeNode) => {
    for (const child of sortedChildren(node)) {
      map.set(child.prefix, child)
      walk(child)
    }
  }

  walk(rootNode.value)
  return map
})

const syntheticRoot = computed<EpochTreeNode>(() => ({
  token: '(all)',
  prefix: '',
  count: visitedEpochIds.value,
  children: rootNode.value.children,
}))

const displayRootNode = computed<EpochTreeNode>(() => {
  if (!displayRootPrefix.value) return syntheticRoot.value
  return nodeByPrefix.value.get(displayRootPrefix.value) ?? syntheticRoot.value
})

const getParentPrefix = (prefix: string) => {
  if (!prefix) return null
  const idx = prefix.lastIndexOf('-')
  if (idx === -1) return ''
  return prefix.slice(0, idx)
}

const canZoomOut = computed(() => displayRootPrefix.value !== '')

const zoomOut = () => {
  if (!canZoomOut.value) return
  const parent = getParentPrefix(displayRootPrefix.value)
  displayRootPrefix.value = parent ?? ''
}

const zoomTo = (prefix: string) => {
  if (isBuilding.value) return
  displayRootPrefix.value = prefix
}

const breadcrumbs = computed(() => {
  if (!displayRootPrefix.value) {
    return [{ prefix: '', token: '(all)' }]
  }

  const segments = displayRootPrefix.value.split('-')
  const out: { prefix: string, token: string }[] = [{ prefix: '', token: '(all)' }]

  let prefix = ''
  for (const seg of segments) {
    prefix = prefix ? `${prefix}-${seg}` : seg
    const node = nodeByPrefix.value.get(prefix)
    out.push({ prefix, token: node?.token ?? seg })
  }

  return out
})

const showLabel = (bar: GanttBar) => bar.widthPct >= 7

const ganttBars = computed<GanttBar[]>(() => {
  const bars: GanttBar[] = []
  const widthPx = max(chartWidthPx.value, 320)

  const walk = (
    node: EpochTreeNode,
    depth: number,
    leftPct: number,
    widthPct: number,
    currentWidthPx: number,
  ) => {
    const children = sortedChildren(node)
    const bar: GanttBar = {
      token: node.token,
      prefix: node.prefix,
      depth,
      leftPct,
      widthPct,
      count: node.count,
      childCount: children.length,
      hiddenChildCount: 0,
    }
    bars.push(bar)

    if (children.length === 0) return

    const childWidthPx = currentWidthPx / children.length
    if (childWidthPx < MIN_CHILD_WIDTH_PX) {
      bar.hiddenChildCount = children.length
      return
    }

    const childWidthPct = widthPct / children.length
    children.forEach((child, idx) => {
      walk(
        child,
        depth + 1,
        leftPct + childWidthPct * idx,
        childWidthPct,
        childWidthPx,
      )
    })
  }

  walk(displayRootNode.value, 0, 0, 100, widthPx)
  return bars
})

const maxDepth = computed(() => {
  if (ganttBars.value.length === 0) return 0
  return max(...ganttBars.value.map((b) => b.depth))
})

const canvasHeight = computed(() => {
  return (maxDepth.value + 1) * (BAR_HEIGHT + BAR_GAP) + 12
})

const barStyle = (bar: GanttBar) => ({
  left: `${bar.leftPct}%`,
  width: `${bar.widthPct}%`,
  top: `${bar.depth * (BAR_HEIGHT + BAR_GAP)}px`,
  height: `${BAR_HEIGHT}px`,
})

const barClass = (bar: GanttBar) => {
  if (bar.prefix === displayRootPrefix.value) return 'bg-blue-700/90 hover:bg-blue-800/90'
  if (bar.hiddenChildCount > 0) return 'bg-amber-500/90 hover:bg-amber-600/90'
  return 'bg-sky-500/90 hover:bg-sky-600/90'
}

const barLabel = (bar: GanttBar) => {
  const hidden = bar.hiddenChildCount > 0 ? ` (hidden ${bar.hiddenChildCount})` : ''
  return `${bar.token}${hidden} · seen ${bar.count}`
}

const updateChartWidth = () => {
  const nextWidth = chartViewportEl.value?.clientWidth
  if (nextWidth && nextWidth > 0) {
    chartWidthPx.value = nextWidth
  }
}

const runTraversal = async () => {
  if (isBuilding.value) return

  isBuilding.value = true
  resetTree()

  const queued = new Set<string>()
  const processed = new Set<string>()
  const visited = new Set<string>()
  const queue: string[] = []

  const enqueue = (jump: string | null | undefined) => {
    if (!jump) return
    if (queued.has(jump) || processed.has(jump)) return
    queued.add(jump)
    queue.push(jump)
  }

  try {
    await nextTick()
    await sleep(30)

    enqueue(indexPrefix(currentEpoch.value.id))

    while (queue.length > 0) {
      const jump = queue.shift()!
      processed.add(jump)
      processedJumpCount.value = processed.size

      const result = await jumpToEpoch(jump)
      await nextTick()

      if (!result) {
        continue
      }

      const currentId = currentEpoch.value.id
      if (!visited.has(currentId)) {
        visited.add(currentId)
        visitedEpochIds.value = visited.size
      }

      addEpochIdToTree(currentId)

      const stack = getStack()
      for (const epoch of stack) {
        if (!isIndexableEpoch(epoch)) continue

        if (isPhaseEpoch(epoch)) {
          for (const phase of epoch.phases) {
            enqueue(`${epoch.id}[${phase}]`)
          }
        } else {
          for (let step = 0; step < epoch.nSteps; step++) {
            enqueue(`${epoch.id}[${step}]`)
          }
        }
      }

      discoveredJumpCount.value = queued.size
    }

    hasBuilt.value = true
    await nextTick()
    updateChartWidth()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    isBuilding.value = false
  }
}

onMounted(async () => {
  updateChartWidth()
  window.addEventListener('resize', updateChartWidth)
  await runTraversal()
})

onUnmounted(() => {
  window.removeEventListener('resize', updateChartWidth)
})
</script>

<template>
  <div p-4>
    <div mb-4 rounded border="~ blue-200" bg-blue-50 px-3 py-2 text-sm text-blue-900>
      <div font-semibold mb-1>How to Use This View</div>
      <div>Read top-to-bottom: each row is one hierarchy level, and sibling bars split width equally.</div>
      <div>Click any bar to zoom into that node; use <b>Up One Level</b> or the breadcrumb buttons to navigate back out.</div>
      <div>If a node has many children, its children are automatically hidden when there is less than 50px per child.</div>
      <div>Use <b>Build Tree</b>/<b>Rebuild Tree</b> to refresh after experiment structure changes.</div>
    </div>

    <div mb-4 flex="~ items-center gap-3 wrap">
      <button
        class="px-3 py-1 rounded bg-blue-600 text-white disabled:opacity-40"
        :disabled="isBuilding"
        @click="runTraversal"
      >
        {{ hasBuilt ? 'Rebuild Tree' : 'Build Tree' }}
      </button>

      <button
        class="px-3 py-1 rounded bg-gray-600 text-white disabled:opacity-40"
        :disabled="!canZoomOut || isBuilding"
        @click="zoomOut"
      >
        Up One Level
      </button>

      <span text-sm text-gray-500>
        processed jumps: {{ processedJumpCount }}
      </span>
      <span text-sm text-gray-500>
        discovered jumps: {{ discoveredJumpCount }}
      </span>
      <span text-sm text-gray-500>
        visited epoch ids: {{ visitedEpochIds }}
      </span>
      <span v-if="isBuilding" text-sm text-blue-600>
        Building...
      </span>
      <span v-if="error" text-sm text-red-600>
        {{ error }}
      </span>
    </div>

    <div mb-3 flex="~ items-center gap-2 wrap" text-sm>
      <button
        v-for="crumb in breadcrumbs"
        :key="crumb.prefix || '__root__'"
        class="px-2 py-0.5 rounded border border-gray-300 bg-white hover:bg-gray-50"
        :class="crumb.prefix === displayRootPrefix ? 'text-blue-700 border-blue-400' : 'text-gray-700'"
        @click="zoomTo(crumb.prefix)"
      >
        {{ crumb.token }}
      </button>
    </div>

    <div text-sm text-gray-500 mb-2>
      Equal-width sibling layout. Children are hidden when available width is under {{ MIN_CHILD_WIDTH_PX }}px per child. Click any node to zoom into it.
    </div>

    <div ref="chartViewportEl" border="~ gray-200" rounded p-3 max-h="75vh" overflow-auto bg-white>
      <div v-if="ganttBars.length === 0" text-sm text-gray-500>
        No epoch nodes discovered yet.
      </div>

      <div v-else class="relative" :style="{ height: `${canvasHeight}px`, minWidth: '900px' }">
        <button
          v-for="bar in ganttBars"
          :key="bar.prefix || '__root_bar__'"
          class="absolute px-2 text-left font-mono text-xs truncate border border-white/70 rounded transition-colors"
          :class="barClass(bar)"
          :style="barStyle(bar)"
          :title="barLabel(bar)"
          @click="zoomTo(bar.prefix)"
        >
          <span v-if="showLabel(bar)">
            {{ bar.token }}
            <template v-if="bar.hiddenChildCount > 0"> (hidden {{ bar.hiddenChildCount }})</template>
            · {{ bar.count }}
          </span>
          <span v-else>·</span>
        </button>
      </div>
    </div>

    <div
      aria-hidden="true"
      class="absolute opacity-0 pointer-events-none"
      :style="{ left: '-400vw', top: '-400vh' }"
    >
      <Experiment />
    </div>
  </div>
</template>
