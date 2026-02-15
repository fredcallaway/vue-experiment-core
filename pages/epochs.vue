<script lang="ts" setup>
import type { Epoch } from '../composables/useEpoch'

definePageMeta({
  layout: 'dashboard',
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

type CapturedNode = {
  id: string
  name: string
  parentId: string | null
  slotFromParent: number | null
}

type CapturedLeaf = {
  leafId: string
  chain: CapturedNode[]
}

type EpochTreeNode = {
  id: string
  name: string
  count: number
  parentId: string | null
  children: EpochTreeNode[]
  childOrder: Record<string, number>
  nextOrder: number
}

type GanttBar = {
  id: string
  name: string
  depth: number
  leftPct: number
  widthPct: number
  count: number
  childCount: number
  hiddenChildCount: number
}

const BAR_HEIGHT = 28
const BAR_GAP = 6
const MIN_CHILD_WIDTH_PX = 50

const chartViewportEl = ref<HTMLElement | null>(null)
const chartWidthPx = ref(1000)

const makeNode = (id: string, name: string, parentId: string | null): EpochTreeNode => ({
  id,
  name,
  count: 0,
  parentId,
  children: [],
  childOrder: {},
  nextOrder: 0,
})

const getSlotFromParent = (parent: Epoch): number | null => {
  const stepValue = (parent as unknown as { step?: { value?: unknown } }).step?.value
  return typeof stepValue === 'number' ? stepValue : null
}

const captureChain = (leafEpoch: Epoch): CapturedNode[] => {
  const reversed: Epoch[] = []
  let cursor: Epoch | null = leafEpoch

  while (cursor && cursor._name !== '__TOP_EPOCH__') {
    reversed.push(cursor)
    cursor = cursor._parent
  }

  const chain = reversed.reverse()

  return chain.map((epoch, idx) => {
    const parent = idx === 0 ? null : chain[idx - 1]!
    return {
      id: epoch.id,
      name: epoch._name,
      parentId: parent?.id ?? null,
      slotFromParent: parent ? getSlotFromParent(parent) : null,
    }
  })
}

const getLeaves = () => new Promise<CapturedLeaf[]>((resolve) => {
  const currentEpoch = useCurrentEpoch()
  const leaves: CapturedLeaf[] = []

  const unwatch = watchImmediate(currentEpoch, async (epoch) => {
    if (epoch.id === '__TOP_EPOCH__') {
      unwatch()
      resolve(leaves)
      return
    }

    if (epoch.isLeaf || !('step' in epoch)) {
      leaves.push({
        leafId: epoch.id,
        chain: captureChain(epoch),
      })
      await nextTick()
      epoch.done()
    }
  })
})

const ensureNode = (
  nodeMap: Map<string, EpochTreeNode>,
  id: string,
  name: string,
  parentId: string | null,
) => {
  const existing = nodeMap.get(id)
  if (existing) return existing

  const node = makeNode(id, name, parentId)
  nodeMap.set(id, node)
  return node
}

const attachChild = (parent: EpochTreeNode, child: EpochTreeNode, slotFromParent: number | null) => {
  if (child.id in parent.childOrder) return

  const order = slotFromParent ?? parent.nextOrder
  parent.childOrder[child.id] = order
  parent.nextOrder = max(parent.nextOrder, order + 1)

  const insertAt = parent.children.findIndex((candidate) => parent.childOrder[candidate.id]! > order)
  if (insertAt === -1) {
    parent.children.push(child)
  } else {
    parent.children.splice(insertAt, 0, child)
  }
}

const buildTreeFromLeaves = (leaves: CapturedLeaf[]) => {
  const root = makeNode('__ROOT__', '(all)', null)
  const nodeMap = new Map<string, EpochTreeNode>([['__ROOT__', root]])

  for (const leaf of leaves) {
    for (const entry of leaf.chain) {
      const node = ensureNode(nodeMap, entry.id, entry.name, entry.parentId)
      node.count += 1

      const parent = entry.parentId ? nodeMap.get(entry.parentId) : root
      if (!parent) continue

      attachChild(parent, node, entry.slotFromParent)
    }
  }

  return root
}

const treeRoot = ref<EpochTreeNode>(makeNode('__ROOT__', '(all)', null))
const displayRootId = ref('')
const isBuilding = ref(false)
const error = ref<string | null>(null)
const hasBuilt = ref(false)
const leafCount = ref(0)

const nodeById = computed(() => {
  const map = new Map<string, EpochTreeNode>()

  const walk = (node: EpochTreeNode) => {
    map.set(node.id, node)
    node.children.forEach(walk)
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
  const out: { id: string, name: string }[] = [{ id: '', name: '(all)' }]

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
    out.push({ id: node.id, name: node.name })
  })

  return out
})

const showLabel = (bar: GanttBar) => bar.widthPct >= 7

const ganttBars = computed<GanttBar[]>(() => {
  const bars: GanttBar[] = []
  const widthPx = max(chartWidthPx.value, 320)

  const startNodes = displayRootId.value
    ? [displayRootNode.value]
    : treeRoot.value.children

  const walk = (
    node: EpochTreeNode,
    depth: number,
    leftPct: number,
    widthPct: number,
    currentWidthPx: number,
  ) => {
    const children = node.children

    const bar: GanttBar = {
      id: node.id,
      name: node.name,
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
  return max(...ganttBars.value.map((bar) => bar.depth))
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
  return `${bar.name}${hidden} · leaves ${bar.count}`
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
      <div>Bars represent epochs only. Sibling order comes from parent step index captured directly from the live epoch chain.</div>
      <div>Click any bar to zoom into that node. Use <b>Up One Level</b> or the breadcrumbs to zoom back out.</div>
      <div>Children are auto-hidden when available width drops below {{ MIN_CHILD_WIDTH_PX }}px per child.</div>
      <div>Use <b>Build Tree</b>/<b>Rebuild Tree</b> to regenerate from the current run.</div>
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
        {{ crumb.name }}
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
            {{ bar.name }}
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
