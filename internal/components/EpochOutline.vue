<script lang="ts" setup>
type EpochNode = {
  id: string
  _name: string
  _parent: EpochNode | null
  children: EpochNode[]
  nSteps?: number
  hasIdenticalChildren?: boolean
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

const getStepIndex = (parentId: string, childId: string) => {
  const escapedParentId = parentId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = childId.match(new RegExp(`^${escapedParentId}\\[(\\d+)\\]`))
  if (!match) return null
  const step = Number(match[1])
  return Number.isInteger(step) ? step : null
}

const cloneSubtreeForStep = (
  source: EpochNode,
  parent: EpochNode,
  sourcePrefix: string,
  targetPrefix: string,
  sourceStep: number,
  targetStep: number,
  isDirectChild: boolean,
): EpochNode => {
  let id = source.id.startsWith(sourcePrefix)
    ? `${targetPrefix}${source.id.slice(sourcePrefix.length)}`
    : `${targetPrefix}-${source._name}`
  let name = source._name

  // Pseudo leaves in IndexableEpochs include the step in their name.
  // Keep those names in sync with the cloned step.
  if (isDirectChild && source._name === `leaf_${sourceStep}`) {
    name = `leaf_${targetStep}`
    id = `${targetPrefix}-${name}`
  }

  const clone: EpochNode = {
    id,
    _name: name,
    _parent: parent,
    children: [],
    nSteps: source.nSteps,
    hasIdenticalChildren: source.hasIdenticalChildren,
  }
  clone.children = source.children.map(child =>
    cloneSubtreeForStep(child, clone, sourcePrefix, targetPrefix, sourceStep, targetStep, false)
  )
  return clone
}

const makeOutlineChildrenResolver = () => {
  const cache = new Map<string, EpochNode[]>()

  const getChildren = (node: EpochNode): EpochNode[] => {
    const cached = cache.get(node.id)
    if (cached) return cached

    let children = node.children
    const shouldCloneIdenticalChildren = node.hasIdenticalChildren === true
      && Number.isInteger(node.nSteps)
      && (node.nSteps ?? 0) > 0
      && node.children.length > 0
      && node.children.length < (node.nSteps ?? 0)

    if (shouldCloneIdenticalChildren) {
      const byStep = new Map<number, EpochNode>()

      let sourceChild = node.children[0]
      let sourceStep = getStepIndex(node.id, sourceChild.id) ?? 0

      for (const child of node.children) {
        const step = getStepIndex(node.id, child.id)
        if (step === null) continue
        byStep.set(step, child)
        if (step < sourceStep) {
          sourceChild = child
          sourceStep = step
        }
      }
      if (!byStep.has(sourceStep)) {
        byStep.set(sourceStep, sourceChild)
      }

      const sourcePrefix = `${node.id}[${sourceStep}]`
      const completeChildren: EpochNode[] = []
      for (let step = 0; step < (node.nSteps ?? 0); step += 1) {
        const existing = byStep.get(step)
        if (existing) {
          completeChildren.push(existing)
          continue
        }

        const targetPrefix = `${node.id}[${step}]`
        completeChildren.push(
          cloneSubtreeForStep(sourceChild, node, sourcePrefix, targetPrefix, sourceStep, step, true)
        )
      }
      children = completeChildren
    }

    cache.set(node.id, children)
    return children
  }

  return getChildren
}

const getStructureSignature = (
  node: EpochNode,
  cache: Map<string, string>,
  getChildren: (node: EpochNode) => EpochNode[],
): string => {
  const existing = cache.get(node.id)
  if (existing !== undefined) return existing

  const childSignatures = getChildren(node).map(child => getStructureSignature(child, cache, getChildren))
  const signature = `${node._name}(${childSignatures.join('|')})`
  cache.set(node.id, signature)
  return signature
}

// true if all the nodes have the same internal structure
const canAggregate = (
  nodes: EpochNode[],
  cache: Map<string, string>,
  getChildren: (node: EpochNode) => EpochNode[],
) => {
  if (nodes.length < MIN_AGGREGATE) return false
  const first = getStructureSignature(nodes[0], cache, getChildren)
  for (let i = 1; i < nodes.length; i += 1) {
    if (getStructureSignature(nodes[i], cache, getChildren) !== first) {
      return false
    }
  }
  return true
}

const currentEpoch = useCurrentEpoch()
const { pinnedIndex, setPinnedEpoch, pinAndJumpToEpoch } = usePinnedEpoch()
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

const hasChildren = (
  node: EpochNode,
  getChildren: ((node: EpochNode) => EpochNode[]) | null = null,
) => (getChildren ?? (n => n.children))(node).length > 0
const isExpanded = (node: EpochNode) => hasChildren(node) && (isActive(node) || !collapsed.value[toNodeId(node)])
const canCollapse = (node: EpochNode) => hasChildren(node) && !isActive(node)

const toggleCollapse = (node: EpochNode) => {
  if (!canCollapse(node)) return
  collapsed.value[node.id] = isExpanded(node)
}

const indexTree = (start: EpochNode) => {
  console.log('indexTree', start.id)
  const depthById: Record<string, number> = {}
  const orderById: Record<string, number> = {}
  const childCountById: Record<string, number> = {}
  const branchIds = new Set<string>()
  let order = 0
  const signatureCache = new Map<string, string>()
  const getChildren = makeOutlineChildrenResolver()

  const childrenAggregateForScoring = (node: EpochNode) => {
    const children = getChildren(node)
    if (!canAggregate(children, signatureCache, getChildren)) return false
    const key = makeAggregateKey(node.id, children)
    return !unaggregatedRuns.value[key]
  }

  const walk = (node: EpochNode, depth: number) => {
    depthById[node.id] = depth
    orderById[node.id] = order++
    // Collapse priority uses effective visible height of a node:
    // aggregated child sets behave like one child.
    const children = getChildren(node)
    childCountById[node.id] = childrenAggregateForScoring(node) ? 1 : children.length
    if (hasChildren(node, getChildren)) {
      branchIds.add(node.id)
    }
    for (const child of children) {
      walk(child, depth + 1)
    }
  }

  walk(start, 0)
  return { depthById, orderById, childCountById, branchIds }
}
type TreeIndex = ReturnType<typeof indexTree>

const visibleRows = computed<OutlineRow[]>(() => {
  const rows: OutlineRow[] = []
  if (!root.value) return rows

  const signatureCache = new Map<string, string>()
  const getChildren = makeOutlineChildrenResolver()

  const walkNode = (node: EpochNode, depth: number) => {
    rows.push({ kind: 'node', node, depth })
    if (!isExpanded(node)) return
    walkChildren(node, depth + 1)
  }

  const walkChildren = (parent: EpochNode, depth: number) => {
    const children = getChildren(parent)
    if (!canAggregate(children, signatureCache, getChildren)) {
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

const buildAggregateCollapseGroups = (start: EpochNode) => {
  const groupKeyById = new Map<string, string>()
  const groupIdsByKey = new Map<string, string[]>()
  const signatureCache = new Map<string, string>()
  const getChildren = makeOutlineChildrenResolver()

  // Mirror render-time aggregation so collapse chooses whole runs
  // (all-or-none) instead of toggling identical siblings independently.
  const walk = (parent: EpochNode) => {
    const children = getChildren(parent)

    if (canAggregate(children, signatureCache, getChildren)) {
      const flushRun = (run: EpochNode[]) => {
        if (run.length === 0) return
        const key = makeAggregateKey(parent.id, run)
        if (unaggregatedRuns.value[key]) return

        const branchIds = run.filter(node => hasChildren(node, getChildren)).map(node => node.id)
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


const listElRef = useTemplateRef('listEl')

const runAutoCollapse = async () => {
  const listEl = assertDefined(listElRef.value)
  const index = indexTree(assertDefined(root.value))

  // Drop stale collapse state.
  for (const id of Object.keys(collapsed.value)) {
    if (!index.branchIds.has(id)) {
      delete collapsed.value[id]
    }
  }

  // Expand active path.
  // We set this explicitly so that it stays expanded when it's no longer active
  for (const node of currentPath.value) {
    collapsed.value[node.id] = false
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
  const { groupKeyById, groupIdsByKey } = buildAggregateCollapseGroups(assertDefined(root.value))
  const activeOrder = orderById[currentEpoch.value.id] ?? 0

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

const isTraversing = ref(false)
const hasTraversed = ref(false)

inspect({ isTraversing, isJumping, hasTraversed })

const traverseTimeline = async () => {
  if (isTraversing.value) return
  console.groupCollapsed('traverseTimeline')
  // console.group('traverseTimeline')
  console.time('traverseTimeline')

  if (isJumping.value) {
    console.log('waiting for existing jump to complete')
    await until(isJumping).toBe(false)
    console.log('existing jump completed; resuming')
  }

  isTraversing.value = true
  const previous = currentEpoch.value // restored at end
  isJumping.value = true

  const { pushHandler } = useErrorHandler()
  const popHandler = pushHandler(err => {
    console.error('Error traversing timeline:', err)
  }, 100)

  let unwatch = null as (() => void) | null
  const doTraversal = () => new Promise((resolve) => {
    // console.log('👉 doTraversal')
    unwatch = watchImmediate(currentEpoch, async (epoch) => {
      console.log(`[${performance.now().toFixed(2)}] traversing`, epoch.id)
      if (epoch.id === '__TOP_EPOCH__') {
        unwatch?.()
        resolve(true)
        return
      }

      if (isMultistepEpoch(epoch) && epoch.hasIdenticalChildren && epoch.step.value > 0) {
        console.log('  hasIdenticalChildren -> skipping remaining')
        epoch.done()
        return
      }
      if (epoch.isPseudoLeaf || !('step' in epoch)) {
        await nextTick()
        epoch.done()
      }
    })
  })

  try {
    // TODO: handle the case where we're not at the start of the experiment
    // this doesn't work for some reason...
    // await jumpToEpoch(TOP_EPOCH.children[0].id)
    // setCurrentEpoch(TOP_EPOCH.children[0])
    // await nextTick()
    await useDataWriter().withDisabled(doTraversal)
    
    hasTraversed.value = true
    console.log('traversal succeeded')
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
    await jumpToEpoch(previous.id)
    console.groupEnd()
    console.timeEnd('traverseTimeline')
  }
}

// We step through the full experiment to discover epochs (nodes)
// NOTE: this will miss epochs that are not always created (e.g. because condition or randomness)
onMounted(async () => {
  console.log('MOUNTED EpochOutline')
  if (currentEpoch.value.id !== '__TOP_EPOCH__') {
    await traverseTimeline()
    hasTraversed.value = true
  }
})

const refreshOutlineLayout = async () => {
  console.debug('refreshing outline layout')
  await nextTick()
  await runAutoCollapse()
  await scrollCurrentIntoView()
}

// adjust layout when epoch changes
watch(currentEpoch, (epoch) => {
  if (hasChildren(epoch) || isTraversing.value || isJumping.value || !hasTraversed.value) return
  void refreshOutlineLayout()
})

// adjust layout whenever jump/traverse ends
watch(() => isTraversing.value || isJumping.value, (value) => {
  if (value || !hasTraversed.value) return
  void refreshOutlineLayout()
})

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
              !isCurrent(row.node) && isAncestor(row.node) ? 'font-bold text-gray-600' : '',
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
            @click.stop="toggleCollapse(row.node)"
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
          <span truncate @click="handleClickNode(row.node)" cursor-pointer min-w-0>{{ row.node._name }}</span>
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
