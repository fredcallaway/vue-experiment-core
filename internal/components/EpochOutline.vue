<script lang="ts" setup>
type EpochNode = {
  id: string
  _name: string
  _parent: EpochNode | null
  children: EpochNode[]
}

type OutlineNodeRow = {
  kind: 'node'
  node: EpochNode
  depth: number
}

type OutlineAggregateRow = {
  kind: 'aggregate'
  key: string
  representative: EpochNode
  nodes: EpochNode[]
  count: number
  depth: number
  expanded: boolean
}

type OutlineRow = OutlineNodeRow | OutlineAggregateRow

const MIN_AGGREGATE = 5
const makeAggregateKey = (parentId: string, nodes: EpochNode[]) => {
  return `${parentId}::${nodes.map(node => node.id).join('|')}`
}

const currentEpoch = useCurrentEpoch()
const collapsed = ref<Record<string, boolean>>({})
const unaggregatedRuns = ref<Record<string, boolean>>({})
const listEl = ref<HTMLElement | null>(null)

// calculating height (same approach as EventView)
const { height: winHeight } = useWindowSize()
const { top } = useElementBounding(useTemplateRef('top-div'))
const { scale } = useSizeScale()
const outlineHeight = computed(() => {
  const usedSpace = (top.value + 10) * scale.value + 20
  return (winHeight.value - usedSpace) / scale.value
})

const root = ref<EpochNode | null>()
watchOnce(currentEpoch, () => {
  root.value = (TOP_EPOCH.children[0] as EpochNode | undefined) ?? null
})

const currentPath = computed<EpochNode[]>(() => {
  const path: EpochNode[] = []
  let node = currentEpoch.value as EpochNode | null

  while (node && node._name !== '__TOP_EPOCH__') {
    path.push(node)
    node = node._parent
  }
  return path.reverse()
})

const ancestorPath = computed(() => {
  return currentPath.value.slice(0, -1)
})

const ancestorIds = computed(() => {
  return new Set(ancestorPath.value.map(node => node.id))
})
const activePathIds = computed(() => {
  return new Set(currentPath.value.map(node => node.id))
})

const hasChildren = (node: EpochNode) => node.children.length > 0
const isCurrent = (node: EpochNode) => node.id === currentEpoch.value.id
const isAncestor = (node: EpochNode) => ancestorIds.value.has(node.id)
const isPinned = (node: EpochNode) => activePathIds.value.has(node.id)

const isExpanded = (node: EpochNode) => {
  return hasChildren(node) && (isPinned(node) || !collapsed.value[node.id])
}

const toggleCollapse = (node: EpochNode) => {
  if (!hasChildren(node) || isPinned(node)) return
  collapsed.value[node.id] = isExpanded(node)
}

const indexTree = (start: EpochNode) => {
  const depthById: Record<string, number> = {}
  const orderById: Record<string, number> = {}
  const childCountById: Record<string, number> = {}
  const branchIds: string[] = []
  let order = 0
  const signatureCache = new Map<string, string>()

  const getSignature = (node: EpochNode): string => {
    const existing = signatureCache.get(node.id)
    if (existing !== undefined) return existing
    const childSignatures = node.children.map(child => getSignature(child))
    const signature = `${node._name}(${childSignatures.join('|')})`
    signatureCache.set(node.id, signature)
    return signature
  }

  const childrenAggregateForScoring = (node: EpochNode) => {
    const children = node.children
    if (children.length < MIN_AGGREGATE) return false
    const first = getSignature(children[0])
    for (let i = 1; i < children.length; i += 1) {
      if (getSignature(children[i]) !== first) {
        return false
      }
    }
    const key = makeAggregateKey(node.id, children)
    return !unaggregatedRuns.value[key]
  }

  const walk = (node: EpochNode, depth: number) => {
    depthById[node.id] = depth
    orderById[node.id] = order++
    childCountById[node.id] = childrenAggregateForScoring(node) ? 1 : node.children.length
    if (hasChildren(node)) {
      branchIds.push(node.id)
    }
    for (const child of node.children) {
      walk(child, depth + 1)
    }
  }

  walk(start, 0)
  return { depthById, orderById, childCountById, branchIds }
}

const collectBranchIds = (node: EpochNode, into: Set<string>) => {
  if (hasChildren(node)) {
    into.add(node.id)
  }
  for (const child of node.children) {
    collectBranchIds(child, into)
  }
}

const getAboveSiblingBranchIds = () => {
  const ids = new Set<string>()
  const path = currentPath.value
  for (let i = 0; i < path.length - 1; i += 1) {
    const parent = path[i]
    const activeChild = path[i + 1]
    const activeIndex = parent.children.findIndex(child => child.id === activeChild.id)
    if (activeIndex <= 0) continue
    for (let j = 0; j < activeIndex; j += 1) {
      collectBranchIds(parent.children[j], ids)
    }
  }
  return ids
}

const getBelowSiblingBranchIds = () => {
  const ids = new Set<string>()
  const path = currentPath.value
  for (let i = 0; i < path.length - 1; i += 1) {
    const parent = path[i]
    const activeChild = path[i + 1]
    const activeIndex = parent.children.findIndex(child => child.id === activeChild.id)
    if (activeIndex < 0 || activeIndex >= parent.children.length - 1) continue
    for (let j = activeIndex + 1; j < parent.children.length; j += 1) {
      collectBranchIds(parent.children[j], ids)
    }
  }
  return ids
}

const runAutoCollapse = async () => {
  if (!root.value) return
  console.log('running auto collapse')

  const activeIds = activePathIds.value
  const { branchIds } = indexTree(root.value)
  const branchSet = new Set(branchIds)
  const nextCollapsed: Record<string, boolean> = { ...collapsed.value }

  // Drop stale collapse state.
  for (const id of Object.keys(nextCollapsed)) {
    if (!branchSet.has(id)) {
      delete nextCollapsed[id]
    }
  }

  // Active path is always expanded.
  for (const id of activeIds) {
    nextCollapsed[id] = false
  }

  collapsed.value = nextCollapsed
  await nextTick()

  const metrics = getActiveRowMetrics()
  if (!metrics) {
    console.log("metrics not available")
    return
  }
  
  await collapseCandidatesUntilFit(getAboveSiblingBranchIds(), 'earlier')

  const metricsAfterAbove = getActiveRowMetrics()
  if (!metricsAfterAbove) return
  if (metricsAfterAbove.container.scrollHeight <= metricsAfterAbove.container.clientHeight + 1) return

  await collapseCandidatesUntilFit(getBelowSiblingBranchIds(), 'later')
}

const getStructureSignature = (node: EpochNode, cache: Map<string, string>): string => {
  const existing = cache.get(node.id)
  if (existing !== undefined) return existing

  const childSignatures = node.children.map(child => getStructureSignature(child, cache))
  const signature = `${node._name}(${childSignatures.join('|')})`
  cache.set(node.id, signature)
  return signature
}

const canAggregateChildren = (children: EpochNode[], cache: Map<string, string>) => {
  if (children.length < MIN_AGGREGATE) return false
  const first = getStructureSignature(children[0], cache)
  for (let i = 1; i < children.length; i += 1) {
    if (getStructureSignature(children[i], cache) !== first) {
      return false
    }
  }
  return true
}

const visibleRows = computed<OutlineRow[]>(() => {
  const rows: OutlineRow[] = []
  if (!root.value) return rows

  const activeIds = activePathIds.value
  const signatureCache = new Map<string, string>()

  const walkNode = (node: EpochNode, depth: number) => {
    rows.push({ kind: 'node', node, depth })
    if (!isExpanded(node)) return
    walkChildren(node, depth + 1)
  }

  const walkChildren = (parent: EpochNode, depth: number) => {
    const children = parent.children
    if (!canAggregateChildren(children, signatureCache)) {
      for (const child of children) {
        walkNode(child, depth)
      }
      return
    }

    const flushAggregateRun = (run: EpochNode[]) => {
      if (run.length === 0) return
      const key = makeAggregateKey(parent.id, run)
      if (unaggregatedRuns.value[key]) {
        for (const node of run) {
          walkNode(node, depth)
        }
        return
      }
      const representative = run[0]
      const expanded = run.some(node => isExpanded(node))
      rows.push({
        kind: 'aggregate',
        key,
        representative,
        nodes: run,
        count: run.length,
        depth,
        expanded,
      })
      if (expanded) {
        walkChildren(representative, depth + 1)
      }
    }

    let run: EpochNode[] = []
    let i = 0
    while (i < children.length) {
      const child = children[i]

      // Active path nodes are never aggregated and split runs.
      if (activeIds.has(child.id)) {
        flushAggregateRun(run)
        run = []
        walkNode(child, depth)
        i += 1
        continue
      }

      run.push(child)
      i += 1
    }
    flushAggregateRun(run)
  }

  walkNode(root.value, 0)
  return rows
})

const indentStep = 14
const indentBase = 8

const guideLeft = (level: number) => {
  return `${indentBase + (level - 1) * indentStep + 6}px`
}

const handleClickNode = (node: EpochNode) => {
  jumpToEpoch(node.id)
}

const toggleAggregate = (row: OutlineAggregateRow) => {
  const shouldCollapse = row.expanded
  for (const node of row.nodes) {
    if (!hasChildren(node) || isPinned(node)) continue
    collapsed.value[node.id] = shouldCollapse
  }
}

const unaggregateRun = (row: OutlineAggregateRow) => {
  unaggregatedRuns.value[row.key] = true
}

const getActiveRowMetrics = () => {
  const container = listEl.value
  if (!container) return null
  const activeEl = container.querySelector<HTMLElement>(`[data-epoch-id="${currentEpoch.value.id}"]`)
  if (!activeEl) return null

  const effectiveScale = scale.value || 1
  const containerRect = container.getBoundingClientRect()
  const activeRect = activeEl.getBoundingClientRect()
  const activeTop = (activeRect.top - containerRect.top) / effectiveScale
  const activeBottom = (activeRect.bottom - containerRect.top) / effectiveScale
  const activeHeight = activeBottom - activeTop
  const topBuffer = 48
  const bottomBuffer = 48
  const safeTop = topBuffer
  const safeBottom = container.clientHeight - bottomBuffer

  return {
    container,
    activeTop,
    activeBottom,
    activeHeight,
    safeTop,
    safeBottom,
  }
}

const collapseCandidatesUntilFit = async (
  candidateIds: Set<string>,
  withinDepth: 'earlier' | 'later'
) => {
  if (!root.value) return
  console.log('collapsing candidates', candidateIds, withinDepth)
  const { depthById, orderById, childCountById } = indexTree(root.value)
  const activeOrder = orderById[currentEpoch.value.id] ?? 0
  const candidates = [...candidateIds]
    .filter(id => !activePathIds.value.has(id))
    .filter(id => collapsed.value[id] !== true)
    .sort((a, b) => {
      const depthCmp = (depthById[b] ?? 0) - (depthById[a] ?? 0)
      if (depthCmp !== 0) return depthCmp

      const childCmp = (childCountById[b] ?? 0) - (childCountById[a] ?? 0)
      if (childCmp !== 0) return childCmp

      const distanceA = Math.abs((orderById[a] ?? activeOrder) - activeOrder)
      const distanceB = Math.abs((orderById[b] ?? activeOrder) - activeOrder)
      const distanceCmp = distanceB - distanceA
      if (distanceCmp !== 0) return distanceCmp

      return withinDepth === 'earlier'
        ? (orderById[a] ?? 0) - (orderById[b] ?? 0)
        : (orderById[b] ?? 0) - (orderById[a] ?? 0)
    })

  const hasVerticalOverflow = () => {
    const container = listEl.value
    if (!container) return false
    return container.scrollHeight > container.clientHeight + 1
  }

  for (const id of candidates) {
    if (!hasVerticalOverflow()) {
      break
    }
    console.log('collapsing', id)
    collapsed.value[id] = true
    await nextTick()
  }
}

const scrollCurrentIntoView = async () => {
  await nextTick()
  const metrics = getActiveRowMetrics()
  if (!metrics) return

  // If the current row is near/beyond the bottom, move it toward the top.
  if (metrics.activeBottom > metrics.safeBottom) {
    const targetOffsetFromTop = 28
    const delta = metrics.activeTop - targetOffsetFromTop
    metrics.container.scrollTo({
      top: metrics.container.scrollTop + delta,
      behavior: 'smooth',
    })
    return
  }

  // If it drifts above the top safe zone, bring it back into view.
  if (metrics.activeTop < metrics.safeTop) {
    const targetOffsetFromBottom = 28
    const targetTop = metrics.container.clientHeight - metrics.activeHeight - targetOffsetFromBottom
    const delta = metrics.activeTop - targetTop
    metrics.container.scrollTo({
      top: metrics.container.scrollTop + delta,
      behavior: 'smooth',
    })
  }
}

const isTraversing = ref(false)
const traverseTimeline = async () => {
  if (isTraversing.value) return
  isTraversing.value = true
  const previous = currentEpoch.value
  let unwatch = null as (() => void) | null

  const { pushHandler } = useErrorHandler()
  const popHandler = pushHandler((err, instance, info, next) => {
    console.error('Error traversing timeline:', err)
  }, 100)

  const doTraversal = () => new Promise((resolve) => {
    // console.log('👉 doTraversal')
    isJumping.value = true
    
    unwatch = watchImmediate(currentEpoch, async (epoch) => {
      console.debug('traverse: ', epoch.id)
      if (epoch.id === '__TOP_EPOCH__') {
        unwatch?.()
        resolve(true)
        return
      }

      if (epoch.isLeaf || !('step' in epoch)) {
        await nextTick()
        epoch.done()
      }
    })
  })

  try {
    await doTraversal()
  } catch (error) {
    console.error('Error traversing timeline:', error)
  } finally {
    popHandler()
    unwatch?.()
    isJumping.value = false
    isTraversing.value = false
    await nextTick()
    // retore original epoch
    setCurrentEpoch(TOP_EPOCH.children[0])
    jumpToEpoch(previous.id)
  }
}

// inspect({
//   currentEpoch: () => currentEpoch.value.id,
//   currentEpochName: () => currentEpoch.value._name,
//   currentPath: () => currentPath.value.map(node => node.id),
// })

const traversed = ref(false)
onMounted(async () => {
  await nextTick()
  if (currentEpoch.value.id !== '__TOP_EPOCH__') {
    await traverseTimeline()
    traversed.value = true
  }
})

// adjust layout when epoch changes
watch(currentEpoch, (epoch) => {
  const hasKids = epoch.children.length > 0
  if (hasKids || isTraversing.value || isJumping.value || !traversed.value) return
  ;(async () => {
    await runAutoCollapse()
    await scrollCurrentIntoView()
  })()
})

// adjust layout whenever jump/traverse ends
watch(() => isTraversing.value || isJumping.value, (value) => {
  if (value || !traversed.value) return
  ;(async () => {
    await runAutoCollapse()
    await scrollCurrentIntoView()
  })()
})

</script>

<template>
  <div
    rounded-lg
    border="~ 2 gray-300"
    bg-white
    pr2
    cursor-default
    flex="~ col"
    relative
    ref="top-div"
    :style="{ height: `${outlineHeight}px` }"
  >

    <div v-if="!root" text-sm text-gray-500>
      Waiting for first epoch...
    </div>

    <div ref="listEl" v-else overflow-y-auto pr-1 subtle-scrollbar flex-1 min-h-0>
      <div
        v-for="row in visibleRows"
        :key="row.kind === 'node' ? row.node.id : row.key"
        :data-epoch-id="row.kind === 'node' ? row.node.id : undefined"
        class="outline-row"
        relative
        flex="~ items-center gap-1"
        text-sm
        :style="{ paddingLeft: `${row.depth * indentStep + indentBase}px` }"
        :class="row.kind === 'node'
          ? [
              isCurrent(row.node) ? 'font-bold text-blue-500' : '',
              !isCurrent(row.node) && isAncestor(row.node) ? 'font-semibold text-gray-600' : '',
              !isCurrent(row.node) && !isAncestor(row.node) ? 'text-gray-400' : '',
            ]
          : 'text-gray-400'"
      >
        <div
          v-if="row.depth > 0"
          class="pointer-events-none absolute inset-y-0 left-0"
        >
          <span
            v-for="level in row.depth"
            :key="`${row.kind === 'node' ? row.node.id : `aggregate-${row.representative.id}`}-guide-${level}`"
            class="absolute inset-y-0 w-px bg-gray-200"
            :style="{ left: guideLeft(level) }"
          />
        </div>

        <template v-if="row.kind === 'node'">
          <button
            v-if="hasChildren(row.node)"
            @click.stop="toggleCollapse(row.node)"
            w-4 h-4
            flex-center
            rounded
            hover:bg-gray-200
            :title="isPinned(row.node) ? 'Pinned ancestor' : (isExpanded(row.node) ? 'Collapse' : 'Expand')"
          >
            <span :class="isExpanded(row.node) ? 'i-mdi-chevron-down' : 'i-mdi-chevron-right'" />
          </button>
          <div v-else w-4 h-4 flex-center i-mdi-circle-outline scale-60 ></div>
          <span truncate @click="handleClickNode(row.node)" cursor-pointer>{{ row.node._name }}</span>
        </template>

        <template v-else>
          <button
            v-if="hasChildren(row.representative)"
            @click.stop="toggleAggregate(row)"
            w-4 h-4
            flex-center
            rounded
            hover:bg-gray-200
            :title="row.expanded ? 'Collapse group' : 'Expand group'"
          >
            <span :class="row.expanded ? 'i-mdi-chevron-down' : 'i-mdi-chevron-right'" />
          </button>
          <div v-else w-4 h-4 flex-center i-mdi-circle-outline scale-60 ></div>
          <span truncate>{{ row.representative._name }}</span>
          <button
            ml-1
            px-1.5
            py-0.5
            rounded-full
            bg-gray-200
            text-gray-600
            text-10px
            cursor-pointer
            hover:bg-gray-300
            @click.stop="unaggregateRun(row)"
            title="Un-aggregate this run"
          >
            {{ row.count }}
          </button>
        </template>
      </div>
    </div>
  </div>
</template>
