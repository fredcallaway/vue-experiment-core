<script lang="ts" setup>
definePageMeta({
  layout: 'bare',
})

useDataWriter().disable()

// suppress expected errors from console
const nuxtApp = useNuxtApp()
const defaultHandler = nuxtApp.vueApp.config.errorHandler
nuxtApp.vueApp.config.errorHandler = (err, instance, info) => {
  if (err === 'useLocalAsync:unmounted') {
    return
  }
  defaultHandler?.(err, instance, info)
}

type ParsedSegment = {
  name: string
  childIndex: number | null
}

type EpochTreeNode = {
  id: string
  token: string
  count: number
  parentId: string | null
  childrenBySlot: Record<string, EpochTreeNode>
  childSlots: number[]
  nextImplicitSlot: number
}

type GanttBar = {
  id: string
  token: string
  depth: number
  leftPct: number
  widthPct: number
  count: number
  childCount: number
  hiddenChildCount: number
}

const makeNode = (id: string, token: string, parentId: string | null): EpochTreeNode => ({
  id,
  token,
  count: 0,
  parentId,
  childrenBySlot: {},
  childSlots: [],
  nextImplicitSlot: 0,
})

const treeRoot = ref<EpochTreeNode>(makeNode('__ROOT__', '(all)', null))
const isBuilding = ref(false)
const error = ref<string | null>(null)
const hasBuilt = ref(false)
const leafCount = ref(0)
const rawLeaves = ref<string[]>([])
const displayRootId = ref<string>('')

const BAR_HEIGHT = 28
const BAR_GAP = 6
const MIN_CHILD_WIDTH_PX = 50

const chartViewportEl = ref<HTMLElement | null>(null)
const chartWidthPx = ref(1000)

const parseSegment = (segment: string): ParsedSegment | null => {
  const match = segment.match(/^([^[]+?)(?:\[(\d+)\])?$/)
  if (!match) return null
  return {
    name: match[1]!,
    childIndex: match[2] == null ? null : Number.parseInt(match[2]!, 10),
  }
}

const parseLeafPath = (leafPath: string): ParsedSegment[] | null => {
  const rawParts = leafPath.split('-').filter(Boolean)
  const parts: ParsedSegment[] = []

  for (const raw of rawParts) {
    const parsed = parseSegment(raw)
    if (!parsed) return null
    parts.push(parsed)
  }

  return parts
}

const ensureChildAtSlot = (parent: EpochTreeNode, slot: number, token: string): EpochTreeNode => {
  const slotKey = String(slot)
  const existing = parent.childrenBySlot[slotKey]
  if (existing) {
    return existing
  }

  const id = parent.id === '__ROOT__'
    ? token
    : `${parent.id}>${slot}:${token}`
  const child = makeNode(id, token, parent.id)

  parent.childrenBySlot[slotKey] = child
  parent.childSlots.push(slot)
  parent.childSlots.sort((a, b) => a - b)

  return child
}

const getLeaves = () => new Promise<string[]>((resolve) => {
  const currentEpoch = useCurrentEpoch()
  const leaves: string[] = []
  const unwatch = watchImmediate(currentEpoch, async (epoch) => {
    if (epoch.id === '__TOP_EPOCH__') {
      unwatch()
      resolve(leaves)
    } else if (epoch.isLeaf || !('step' in epoch)) {
      leaves.push(epoch.id)
      await nextTick()
      epoch.done()
    }
  })
})

const buildTreeFromLeaves = (leaves: string[]): EpochTreeNode => {
  const root = makeNode('__ROOT__', '(all)', null)

  for (const leaf of leaves) {
    const parts = parseLeafPath(leaf)
    if (!parts || parts.length === 0) continue

    let node = root

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!
      const slot = i === 0
        ? 0
        : (parts[i - 1]!.childIndex ?? node.nextImplicitSlot++)

      node = ensureChildAtSlot(node, slot, part.name)
      node.count += 1
    }
  }

  return root
}

const sortedChildren = (node: EpochTreeNode) =>
  node.childSlots.map((slot) => node.childrenBySlot[String(slot)]!).filter(Boolean)

const nodeById = computed(() => {
  const map = new Map<string, EpochTreeNode>()

  const walk = (node: EpochTreeNode) => {
    map.set(node.id, node)
    for (const child of sortedChildren(node)) {
      walk(child)
    }
  }

  walk(treeRoot.value)
  return map
})

const displayRootNode = computed(() => {
  if (!displayRootId.value) return treeRoot.value
  return nodeById.value.get(displayRootId.value) ?? treeRoot.value
})

const canZoomOut = computed(() => displayRootNode.value.parentId != null)

const zoomTo = (id: string) => {
  if (isBuilding.value) return
  displayRootId.value = id
}

const zoomOut = () => {
  if (!canZoomOut.value) return
  const parentId = displayRootNode.value.parentId
  displayRootId.value = parentId === '__ROOT__' || parentId == null ? '' : parentId
}

const breadcrumbs = computed(() => {
  const out: { id: string, token: string }[] = [{ id: '', token: '(all)' }]

  if (!displayRootId.value) {
    return out
  }

  const stack: EpochTreeNode[] = []
  let cursor: EpochTreeNode | undefined = displayRootNode.value

  while (cursor && cursor.id !== '__ROOT__') {
    stack.push(cursor)
    if (!cursor.parentId) break
    cursor = nodeById.value.get(cursor.parentId)
  }

  stack.reverse().forEach((node) => {
    out.push({ id: node.id, token: node.token })
  })

  return out
})

const showLabel = (bar: GanttBar) => bar.widthPct >= 7

const ganttBars = computed<GanttBar[]>(() => {
  const bars: GanttBar[] = []
  const widthPx = max(chartWidthPx.value, 320)

  const startNodes = displayRootId.value
    ? [displayRootNode.value]
    : sortedChildren(treeRoot.value)

  const walk = (
    node: EpochTreeNode,
    depth: number,
    leftPct: number,
    widthPct: number,
    currentWidthPx: number,
  ) => {
    const children = sortedChildren(node)

    const bar: GanttBar = {
      id: node.id,
      token: node.token,
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

  if (startNodes.length === 0) {
    return bars
  }

  const sliceWidthPct = 100 / startNodes.length
  const sliceWidthPx = widthPx / startNodes.length

  startNodes.forEach((node, idx) => {
    walk(node, 0, sliceWidthPct * idx, sliceWidthPct, sliceWidthPx)
  })

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
  if (bar.id === displayRootId.value) return 'bg-blue-700/90 hover:bg-blue-800/90'
  if (bar.hiddenChildCount > 0) return 'bg-amber-500/90 hover:bg-amber-600/90'
  return 'bg-sky-500/90 hover:bg-sky-600/90'
}

const barLabel = (bar: GanttBar) => {
  const hidden = bar.hiddenChildCount > 0 ? ` (hidden ${bar.hiddenChildCount})` : ''
  return `${bar.token}${hidden} · leaves ${bar.count}`
}

const updateChartWidth = () => {
  const nextWidth = chartViewportEl.value?.clientWidth
  if (nextWidth && nextWidth > 0) {
    chartWidthPx.value = nextWidth
  }
}

const runBuild = async () => {
  if (isBuilding.value) return

  isBuilding.value = true
  error.value = null
  hasBuilt.value = false

  try {
    const leaves = await getLeaves()
    rawLeaves.value = leaves
    leafCount.value = leaves.length
    treeRoot.value = buildTreeFromLeaves(leaves)
    displayRootId.value = ''
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
  await runBuild()
})

onUnmounted(() => {
  window.removeEventListener('resize', updateChartWidth)
})
</script>

<template>
  <div p-4>
    <div mb-4 rounded border="~ blue-200" bg-blue-50 px-3 py-2 text-sm text-blue-900>
      <div font-semibold mb-1>How to Use This View</div>
      <div>Bars represent epochs only. Child slot indices from the leaf list are used only to place sibling order left-to-right.</div>
      <div>Click any bar to zoom into that node. Use <b>Up One Level</b> or the breadcrumbs to zoom back out.</div>
      <div>Children are auto-hidden when available width drops below {{ MIN_CHILD_WIDTH_PX }}px per child.</div>
      <div>Use <b>Build Tree</b>/<b>Rebuild Tree</b> to regenerate from the current leaf list.</div>
    </div>

    <div mb-4 flex="~ items-center gap-3 wrap">
      <button
        class="px-3 py-1 rounded bg-blue-600 text-white disabled:opacity-40"
        :disabled="isBuilding"
        @click="runBuild"
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
        leaves: {{ leafCount }}
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
        :key="crumb.id || '__root__'"
        class="px-2 py-0.5 rounded border border-gray-300 bg-white hover:bg-gray-50"
        :class="crumb.id === displayRootId ? 'text-blue-700 border-blue-400' : 'text-gray-700'"
        @click="zoomTo(crumb.id)"
      >
        {{ crumb.token }}
      </button>
    </div>

    <div ref="chartViewportEl" border="~ gray-200" rounded p-3 max-h="75vh" overflow-auto bg-white>
      <div v-if="ganttBars.length === 0" text-sm text-gray-500>
        No epoch nodes discovered yet.
      </div>

      <div v-else class="relative" :style="{ height: `${canvasHeight}px`, minWidth: '900px' }">
        <button
          v-for="bar in ganttBars"
          :key="bar.id"
          class="absolute px-2 text-left font-mono text-xs truncate border border-white/70 rounded transition-colors"
          :class="barClass(bar)"
          :style="barStyle(bar)"
          :title="barLabel(bar)"
          @click="zoomTo(bar.id)"
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

    <div mt-3 text-xs text-gray-500>
      {{ rawLeaves.length }} leaf paths captured.
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
