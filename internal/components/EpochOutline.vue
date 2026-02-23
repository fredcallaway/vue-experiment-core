<script lang="ts" setup>
import type { EpochNode } from '../composables/useEpochTree'

const currentEpoch = useCurrentEpoch()
const { pinnedIndex, setPinnedEpoch, pinAndJumpToEpoch } = usePinnedEpoch()
const {
  root,
  isTraversing,
  hasTraversed,
  traverseTimeline,
} = useEpochTree()

const collapsed = ref<Record<string, boolean>>({})

const currentPath = computed<string[]>(() => {
  const path: string[] = []
  let node = currentEpoch.value
  while (node._name !== '__TOP_EPOCH__') {
    path.push(node.id)
    node = node._parent
  }
  return path.reverse()
})

// EPOCH NODE PROPERTIES

type NodeOrId = EpochNode | string
const toNodeId = (target: NodeOrId) => typeof target === 'string' ? target : target.id
const isCurrent = (target: NodeOrId) => toNodeId(target) === currentEpoch.value.id
const isActive = (target: NodeOrId) => currentPath.value.includes(toNodeId(target))
const isAncestor = (target: NodeOrId) => isActive(target) && !isCurrent(target)
const hasError = (node: EpochNode) => Boolean(node.error)
const getNodeTextClass = (node: EpochNode) => {
  if (hasError(node)) {
    return isCurrent(node) || isAncestor(node) ? 'font-bold text-red-600' : 'text-red-500'
  }
  if (isCurrent(node)) return 'font-bold text-blue-500'
  if (isAncestor(node)) return 'font-bold text-gray-600'
  return 'text-gray-400'
}
const hasChildren = (node: EpochNode) => node.children.length > 0
const isExpanded = (node: EpochNode) => hasChildren(node) && (isActive(node) || !collapsed.value[toNodeId(node)])
const canCollapse = (node: EpochNode) => hasChildren(node) && !isActive(node)
const shouldAggregate = (node: EpochNode) => node.hasIdenticalChildren === true

const getStepIndex = (parentId: string, childId: string) => {
  const escapedParentId = parentId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = childId.match(new RegExp(`^${escapedParentId}\\[(\\d+)\\]`))
  if (!match) return null
  const step = Number(match[1])
  return Number.isInteger(step) ? step : null
}

// OUTLINE CONSTRUCTION

type OutlineNode = {
  node: EpochNode
  expanded: boolean
  children: OutlineNode[]
  effectiveChildCount: number
  identical: {
    total: number
    activeStep: number | null
    stepNodeIds: string[]
  } | null
}

const makeOutlineNode = (node: EpochNode): OutlineNode => {
  const memberTrees = node.children.map(child => makeOutlineNode(child))
  const hasIdentical = shouldAggregate(node) && memberTrees.length > 0
  const memberNodes = hasIdentical ? memberTrees.map(member => member.node) : []
  const activeIndex = hasIdentical ? memberNodes.findIndex(member => isActive(member)) : -1
  const activeNode = activeIndex >= 0 ? memberNodes[activeIndex] : null
  const parsedStep = activeNode ? getStepIndex(node.id, activeNode.id) : null
  const fallbackStep = activeIndex >= 0 ? activeIndex : -1
  const activeStep = activeNode
    ? ((parsedStep ?? fallbackStep) >= 0 ? (parsedStep ?? fallbackStep) + 1 : null)
    : null
  const activeTree = hasIdentical
    ? (activeIndex >= 0 ? memberTrees[activeIndex] : memberTrees[0])
    : null
  const children = hasIdentical ? (activeTree ? [activeTree] : []) : memberTrees

  const result = {
    node,
    expanded: isExpanded(node),
    children,
    effectiveChildCount: hasIdentical ? 1 : children.length,
    identical: hasIdentical
      ? {
          total: Number.isInteger(node.nSteps) ? (node.nSteps ?? memberTrees.length) : memberTrees.length,
          activeStep,
          stepNodeIds: memberNodes.map(member => member.id),
        }
      : null,
  } as const
  if (result.identical) {
    assert(R.isDeepEqual(result.identical.stepNodeIds, memberNodes.map(member => member.id)), 'stepNodeIds mismatch')
    assert(result.children.length == 1)
  }
  assert(result.effectiveChildCount == result.children.length)
  return result
}

const outlineRoot = computed<OutlineNode | null>(() => {
  return root.value ? makeOutlineNode(root.value) : null
})

const indexTree = (start: OutlineNode) => {
  const depthById: Record<string, number> = {}
  const orderById: Record<string, number> = {}
  const childCountById: Record<string, number> = {}
  const branchIds = new Set<string>()
  let order = 0

  const walkNode = (entry: OutlineNode, depth: number) => {
    const node = entry.node
    depthById[node.id] = depth
    orderById[node.id] = order++
    // Collapse priority uses effective visible height of a node:
    // aggregated child sets behave like one child.
    childCountById[node.id] = entry.effectiveChildCount
    if (hasChildren(node)) {
      branchIds.add(node.id)
    }
    for (const child of entry.children) {
      walkNode(child, depth + 1)
    }
  }

  walkNode(start, 0)
  return { depthById, orderById, childCountById, branchIds }
}

type OutlineRow = OutlineNode & { depth: number }

const visibleRows = computed<OutlineRow[]>(() => {
  const rows: OutlineRow[] = []
  if (!outlineRoot.value) return rows

  const walk = (entry: OutlineNode, depth: number) => {
    rows.push({ ...entry, depth })
    if (!entry.expanded) return
    for (const child of entry.children) {
      walk(child, depth + 1)
    }
  }

  walk(outlineRoot.value, 0)
  return rows
})

// AUTOMATIC COLLAPSE AND SCROLL

const listElRef = useTemplateRef('listEl')

const runAutoCollapse = async () => {
  const listEl = assertDefined(listElRef.value)
  const index = indexTree(assertDefined(outlineRoot.value))

  // Drop stale collapse state.
  for (const id of Object.keys(collapsed.value)) {
    if (!index.branchIds.has(id)) {
      delete collapsed.value[id]
    }
  }

  // Expand active path.
  // We set this explicitly so that it stays expanded when it's no longer active
  for (const id of currentPath.value) {
    collapsed.value[id] = false
  }

  await nextTick()

  // Now we collapse nodes to make the outline fit in the available height (if possible)
  const hasVerticalOverflow = () => listEl.scrollHeight > listEl.clientHeight + 1
  if (!hasVerticalOverflow()) return

  // Build a list of candidates to collapse; aggregated nodes are treated as one candidate
  type CollapseCandidate = {
    key: string
    ids: string[]
    depth: number
    childCount: number
    distance: number
    direction: number
  }
  const { depthById, orderById, childCountById, branchIds } = index
  const activeOrder = orderById[currentEpoch.value.id] ?? 0

  const candidateMap = new Map<string, CollapseCandidate>()
  for (const id of branchIds) {
    if (isActive(id) || collapsed.value[id] === true) continue

    const key = `node:${id}`
    if (candidateMap.has(key)) continue

    const ids = [id].filter(groupedId =>
      !isActive(groupedId)
      && collapsed.value[groupedId] !== true
      && depthById[groupedId] !== undefined
    )
    if (ids.length === 0) continue

    const depth = Math.max(...ids.map(groupedId => depthById[groupedId] ?? 0))
    const childCount = Math.max(...ids.map(groupedId => childCountById[groupedId] ?? 0))
    const order = Math.max(...ids.map(groupedId => orderById[groupedId] ?? activeOrder))
    const direction = Math.sign(order - activeOrder) // * (prefDirection === 'later' ? -1 : 1)
    const distance = Math.abs(order - activeOrder)

    candidateMap.set(key, {
      key,
      ids,
      depth,
      childCount,
      distance,
      direction,
    })
  }

  // Sort candidates by priority: this could be tuned to change collapsing behavior
  const candidates = [...candidateMap.values()].sort((a, b) =>
    (b.direction - a.direction)
    || (b.depth - a.depth)
    || (b.childCount - a.childCount)
    || (b.distance - a.distance)
  )

  const setCollapsed = (candidate: CollapseCandidate, value: boolean) => {
    for (const id of candidate.ids) {
      collapsed.value[id] = value
    }
  }

  // collapse until fit
  const collapsedCandidates: CollapseCandidate[] = []
  for (const candidate of candidates) {
    if (!hasVerticalOverflow()) break
    setCollapsed(candidate, true)
    collapsedCandidates.push(candidate)
    await nextTick()
  }
  // try to uncollapse
  for (const candidate of collapsedCandidates.reverse()) {
    setCollapsed(candidate, false)
    await nextTick()
    if (hasVerticalOverflow()) {
      setCollapsed(candidate, true)
      // don't break: another candidate might fit
    }
  }
}

const scrollCurrentIntoView = async () => {
  await nextTick()

  const listEl = listElRef.value
  if (!listEl) return null
  const activeEl = listEl.querySelector<HTMLElement>(`[data-epoch-id="${currentEpoch.value.id}"]`)
  if (!activeEl) return null

  const effectiveScale = useSizeScale().effectiveScale.value
  const containerRect = listEl.getBoundingClientRect()
  const activeRect = activeEl.getBoundingClientRect()
  const activeTop = (activeRect.top - containerRect.top) / effectiveScale
  const activeBottom = (activeRect.bottom - containerRect.top) / effectiveScale
  const activeHeight = activeBottom - activeTop
  const topBuffer = 48
  const bottomBuffer = 48
  const safeTop = topBuffer
  const safeBottom = listEl.clientHeight - bottomBuffer

  // If the current row is near/beyond the bottom, move it toward the top.
  if (activeBottom > safeBottom) {
    const targetOffsetFromTop = 28
    const delta = activeTop - targetOffsetFromTop
    listEl.scrollTo({
      top: listEl.scrollTop + delta,
      behavior: 'smooth',
    })
    return
  }

  // If it drifts above the top safe zone, bring it back into view.
  if (activeTop < safeTop) {
    const targetOffsetFromBottom = 28
    const targetTop = listEl.clientHeight - activeHeight - targetOffsetFromBottom
    const delta = activeTop - targetTop
    listEl.scrollTo({
      top: listEl.scrollTop + delta,
      behavior: 'smooth',
    })
  }
}

const refreshOutlineLayout = async () => {
  console.debug('refreshing outline layout')
  await nextTick()
  await runAutoCollapse()
  await scrollCurrentIntoView()
}

// adjust layout when epoch changes
watch(currentEpoch, (epoch) => {
  if (epoch.children.length > 0 || isTraversing.value || isJumping.value || !hasTraversed.value) return
  void refreshOutlineLayout()
})

// adjust layout whenever jump/traverse ends
watch(() => isTraversing.value || isJumping.value, (value) => {
  if (value || !hasTraversed.value) return
  void refreshOutlineLayout()
})

// HANDLERS

const handleClickNode = (node: EpochNode) => {
  void jumpToEpoch(node.id)
}

const isPinnedNode = (node: EpochNode) => pinnedIndex.value === node.id

const handlePinNode = async (node: EpochNode) => {
  if (hasChildren(node)) return
  if (isPinnedNode(node)) {
    await setPinnedEpoch(undefined)
    return
  }
  await pinAndJumpToEpoch(node.id)
}

const handleToggleCollapse = (node: EpochNode) => {
  if (!canCollapse(node)) return
  collapsed.value[node.id] = isExpanded(node)
}

const cycleIdenticalStep = async (nodeId: string, direction: 1 | -1 = 1) => {
  const row = visibleRows.value.find(entry => entry.node.id === nodeId)
  if (!row) return
  if (!row.identical) return
  const stepNodeIds = row.identical.stepNodeIds
  if (stepNodeIds.length === 0) return
  
  const step = row.identical.activeStep // WARN: one-indexed
  const N = stepNodeIds.length
  const targetIndex = step == null
    ? (direction > 0 ? 0 : N - 1) // first/last step for scroll down/up
    : (step - 1 + direction + N) % N

  const targetId = stepNodeIds[targetIndex]
  if (!targetId) return
  await jumpToEpoch(targetId)
}

const getScrollHandler = useMemoize((row: OutlineRow) => {
  return useScrollHandler((direction) => {
    void cycleIdenticalStep(row.node.id, direction as 1 | -1)
  })
}, { getKey: (row) => row.node.id })

const handleScroll = (row: OutlineRow, event: WheelEvent) => {
  const handler = getScrollHandler(row)
  handler(event)
}

// POSITIONING

// calculating height (same approach as EventView)
const { height: winHeight } = useWindowSize()
const { top, width } = useElementBounding(useTemplateRef('top-div'))
const { effectiveScale } = useSizeScale()
const outlineHeight = computed(() => {
  const usedSpace = (top.value + 10) * effectiveScale.value + 20
  return (winHeight.value - usedSpace) / effectiveScale.value
})

// don't allow width to decrease (only increase)
const maxSeenWidth = ref(100)
watchEffect(() => {
  maxSeenWidth.value = Math.max(maxSeenWidth.value, width.value)
})

const indentStep = 14
const indentBase = 8

</script>

<template>
  <div
    rounded-lg
    border="~ 2 gray-300"
    bg-white
    cursor-default
    flex="~ col"
    pr2
    relative
    ref="top-div"
    :style="{ height: `${outlineHeight}px`, minWidth: `${maxSeenWidth}px` }"
  >
    <h2 ml2 shrink-0>Outline</h2>
    <button @click="traverseTimeline" :disabled="isTraversing" btn-xs absolute right-1 top-1 >reindex</button>
    
    <div v-if="!root" text-sm text-gray-500>
      Waiting for first epoch...
    </div>

    <div ref="listEl" v-else overflow-y-auto pr-1 subtle-scrollbar flex-1 min-h-0>
      <div
        v-for="row in visibleRows"
        :key="row.node.id"
        :data-epoch-id="row.node.id"
        class="outline-row"
        relative
        flex="~ items-center gap-1"
        text-sm
        :style="{ paddingLeft: `${row.depth * indentStep + indentBase}px` }"
        :class="getNodeTextClass(row.node)"
      >
        <div
          v-if="row.depth > 0"
          class="pointer-events-none absolute inset-y-0 left-0"
        >
          <span
            v-for="level in row.depth"
            :key="`${row.node.id}-guide-${level}`"
            class="absolute inset-y-0 w-px bg-gray-200"
            :style="{ left: `${indentBase + (level - 1) * indentStep + 6}px}` }"
          />
        </div>

        <div
          v-if="hasChildren(row.node) && isAncestor(row.node)"
          w-4 h-4
          flex-center
          rounded
          title="Cannot collapse ancestor"
        >
          <span i-mdi-arrow-right-bold />
        </div>
        <button
          v-else-if="hasChildren(row.node)"
          @click.stop="handleToggleCollapse(row.node)"
          w-4 h-4
          flex-center
          rounded
          hover:bg-gray-200
          :title="isActive(row.node) ? 'Pinned ancestor' : (isExpanded(row.node) ? 'Collapse' : 'Expand')"
        >
          <span :class="isExpanded(row.node) ? 'i-mdi-chevron-down' : 'i-mdi-chevron-right'" />
        </button>
        <button
          v-else
          @click.stop="handlePinNode(row.node)"
          w-4
          h-4
          flex-center
          rounded
          class="group"
          hover:bg-gray-100
          :title="isPinnedNode(row.node) ? 'Unpin' : 'Pin and jump'"
        >
          <div
            v-if="isPinnedNode(row.node)"
            i-mdi-pin
            text-blue-500
          />
          <template v-else>
            <div v-if="isCurrent(row.node)" class="group-hover:hidden" i-mdi-arrow-right-bold text-blue-500 />
            <div v-else class="group-hover:hidden" i-mdi-circle-outline scale-60 text-gray-400 />
            <div class="hidden group-hover:block" i-mdi-pin-outline text-gray-300 />
          </template>
        </button>
        <span
          truncate
          @click="handleClickNode(row.node)"
          cursor-pointer
          min-w-0
          :title="row.node.error || undefined"
        >
          {{ row.node.name }}
        </span>
        <button
          v-if="row.identical"
          @click.stop="cycleIdenticalStep(row.node.id, 1)"
          @contextmenu.prevent.stop="cycleIdenticalStep(row.node.id, -1)"
          @wheel="handleScroll(row, $event)"
          ml-1
          px-1.5
          py-0.5
          rounded-full
          text-10px
          cursor-pointer
          hover:brightness-95
          title="left/right click or scroll to cycle through steps"
          :class="row.identical.activeStep !== null ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-600'"
        >
          {{ row.identical.activeStep !== null ? `${row.identical.activeStep} / ${row.identical.total}` : row.identical.total }}
        </button>
      </div>
    </div>
  </div>
</template>
