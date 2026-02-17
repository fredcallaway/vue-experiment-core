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

const getStructureSignature = (node: EpochNode, cache: Map<string, string>): string => {
  const existing = cache.get(node.id)
  if (existing !== undefined) return existing

  const childSignatures = node.children.map(child => getStructureSignature(child, cache))
  const signature = `${node._name}(${childSignatures.join('|')})`
  cache.set(node.id, signature)
  return signature
}

// true if all the nodes have the same internal structure
const canAggregate = (nodes: EpochNode[], cache: Map<string, string>) => {
  if (nodes.length < MIN_AGGREGATE) return false
  const first = getStructureSignature(nodes[0], cache)
  for (let i = 1; i < nodes.length; i += 1) {
    if (getStructureSignature(nodes[i], cache) !== first) {
      return false
    }
  }
  return true
}

const currentEpoch = useCurrentEpoch()
const collapsed = ref<Record<string, boolean>>({})
const unaggregatedRuns = ref<Record<string, boolean>>({})

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

type NodeOrId = EpochNode | string
const toNodeId = (target: NodeOrId) => typeof target === 'string' ? target : target.id
const isCurrent = (target: NodeOrId) => toNodeId(target) === currentEpoch.value.id
const isActive = (target: NodeOrId) => currentPath.value.some(n => toNodeId(n) === toNodeId(target))
const isAncestor = (target: NodeOrId) => isActive(target) && !isCurrent(target)

const hasChildren = (node: EpochNode) => node.children.length > 0
const isExpanded = (node: EpochNode) => hasChildren(node) && (isActive(node) || !collapsed.value[toNodeId(node)])
const canCollapse = (node: EpochNode) => hasChildren(node) && !isActive(node)

const toggleCollapse = (node: EpochNode) => {
  if (!canCollapse(node)) return
  collapsed.value[node.id] = isExpanded(node)
}

const indexTree = (start: EpochNode) => {
  const depthById: Record<string, number> = {}
  const orderById: Record<string, number> = {}
  const childCountById: Record<string, number> = {}
  const branchIds = new Set<string>()
  let order = 0
  const signatureCache = new Map<string, string>()

  const childrenAggregateForScoring = (node: EpochNode) => {
    const children = node.children
    if (!canAggregate(children, signatureCache)) return false
    const key = makeAggregateKey(node.id, children)
    return !unaggregatedRuns.value[key]
  }

  const walk = (node: EpochNode, depth: number) => {
    depthById[node.id] = depth
    orderById[node.id] = order++
    // Collapse priority uses effective visible height of a node:
    // aggregated child sets behave like one child.
    childCountById[node.id] = childrenAggregateForScoring(node) ? 1 : node.children.length
    if (hasChildren(node)) {
      branchIds.add(node.id)
    }
    for (const child of node.children) {
      walk(child, depth + 1)
    }
  }

  walk(start, 0)
  return { depthById, orderById, childCountById, branchIds }
}
type TreeIndex = ReturnType<typeof indexTree>

const runAutoCollapse = async () => {
  if (!root.value) return
  // console.log('running auto collapse')

  const index = indexTree(root.value)
  const nextCollapsed: Record<string, boolean> = { ...collapsed.value }

  // Drop stale collapse state.
  for (const id of Object.keys(nextCollapsed)) {
    if (!index.branchIds.has(id)) {
      delete nextCollapsed[id]
    }
  }

  // Active path is always expanded.
  for (const node of currentPath.value) {
    nextCollapsed[node.id] = false
  }

  collapsed.value = nextCollapsed
  await nextTick()
  
  await collapseCandidatesUntilFit(index, 'earlier')
}

const visibleRows = computed<OutlineRow[]>(() => {
  const rows: OutlineRow[] = []
  if (!root.value) return rows

  const signatureCache = new Map<string, string>()

  const walkNode = (node: EpochNode, depth: number) => {
    rows.push({ kind: 'node', node, depth })
    if (!isExpanded(node)) return
    walkChildren(node, depth + 1)
  }

  const walkChildren = (parent: EpochNode, depth: number) => {
    const children = parent.children
    if (!canAggregate(children, signatureCache)) {
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
      if (isActive(child)) {
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
    if (!hasChildren(node) || isActive(node)) continue
    collapsed.value[node.id] = shouldCollapse
  }
}

const unaggregateRun = (row: OutlineAggregateRow) => {
  unaggregatedRuns.value[row.key] = true
}

const listEl = ref<HTMLElement | null>(null)
const getActiveRowMetrics = () => {
  const container = listEl.value
  if (!container) return null
  const activeEl = container.querySelector<HTMLElement>(`[data-epoch-id="${currentEpoch.value.id}"]`)
  if (!activeEl) return null

  const effectiveScale = useSizeScale().effectiveScale.value
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

const buildAggregateCollapseGroups = (start: EpochNode) => {
  const groupKeyById = new Map<string, string>()
  const groupIdsByKey = new Map<string, string[]>()
  const signatureCache = new Map<string, string>()

  // Mirror render-time aggregation so collapse chooses whole runs
  // (all-or-none) instead of toggling identical siblings independently.
  const walk = (parent: EpochNode) => {
    const children = parent.children

    if (canAggregate(children, signatureCache)) {
      const flushRun = (run: EpochNode[]) => {
        if (run.length === 0) return
        const key = makeAggregateKey(parent.id, run)
        if (unaggregatedRuns.value[key]) return

        const branchIds = run.filter(hasChildren).map(node => node.id)
        if (branchIds.length === 0) return

        groupIdsByKey.set(key, branchIds)
        for (const id of branchIds) {
          groupKeyById.set(id, key)
        }
      }

      let run: EpochNode[] = []
      for (const child of children) {
        if (isActive(child)) {
          flushRun(run)
          run = []
        } else {
          run.push(child)
        }
      }
      flushRun(run)
    }

    for (const child of children) {
      walk(child)
    }
  }

  walk(start)
  return { groupKeyById, groupIdsByKey }
}

const collapseCandidatesUntilFit = async (
  index: TreeIndex,
  prefDirection: 'earlier' | 'later'
) => {
  if (!root.value) return

  const hasVerticalOverflow = () => {
    const container = listEl.value
    if (!container) return false
    return container.scrollHeight > container.clientHeight + 1
  }

  if (!hasVerticalOverflow()) return

  // console.log('collapsing candidates', candidateIds, prefDirection)
  const { depthById, orderById, childCountById, branchIds } = index
  const { groupKeyById, groupIdsByKey } = buildAggregateCollapseGroups(root.value)
  const activeOrder = orderById[currentEpoch.value.id] ?? 0

  type CollapseCandidate = {
    key: string
    ids: string[]
    depth: number
    childCount: number
    distance: number
    direction: number
  }

  const candidateMap = new Map<string, CollapseCandidate>()

  for (const id of branchIds) {
    if (isActive(id) || collapsed.value[id] === true) continue

    const key = groupKeyById.get(id) ?? `node:${id}`
    if (candidateMap.has(key)) continue

    const groupedIds = groupIdsByKey.get(key) ?? [id]
    const ids = groupedIds.filter(groupedId =>
      !isActive(groupedId)
      && collapsed.value[groupedId] !== true
      && depthById[groupedId] !== undefined
    )
    if (ids.length === 0) continue

    const depth = Math.max(...ids.map(groupedId => depthById[groupedId] ?? 0))
    const childCount = Math.max(...ids.map(groupedId => childCountById[groupedId] ?? 0))
    const order = Math.max(...ids.map(groupedId => orderById[groupedId] ?? activeOrder))
    // const orders = ids.map(groupedId => orderById[groupedId] ?? activeOrder)
    // const orderRef = prefDirection === 'earlier' ? Math.min(...orders) : Math.max(...orders)
    const direction = Math.sign(order - activeOrder) * (prefDirection === 'earlier' ? 1 : -1)
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
  const popHandler = pushHandler(err => {
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

const refreshOutlineLayout = async () => {
  await runAutoCollapse()
  await scrollCurrentIntoView()
}

// adjust layout when epoch changes
watch(currentEpoch, (epoch) => {
  const hasKids = epoch.children.length > 0
  if (hasKids || isTraversing.value || isJumping.value || !traversed.value) return
  void refreshOutlineLayout()
})

// adjust layout whenever jump/traverse ends
watch(() => isTraversing.value || isJumping.value, (value) => {
  if (value || !traversed.value) return
  void refreshOutlineLayout()
})

// calculating height (same approach as EventView)
const { height: winHeight } = useWindowSize()
const { top } = useElementBounding(useTemplateRef('top-div'))
const { effectiveScale } = useSizeScale()
const outlineHeight = computed(() => {
  const usedSpace = (top.value + 10) * effectiveScale.value + 20
  return (winHeight.value - usedSpace) / effectiveScale.value
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
            :title="isActive(row.node) ? 'Pinned ancestor' : (isExpanded(row.node) ? 'Collapse' : 'Expand')"
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
