<script lang="ts" setup>
type EpochNode = {
  id: string
  _name: string
  _parent: EpochNode | null
  children: EpochNode[]
}

type VisibleNode = {
  node: EpochNode
  depth: number
}

const currentEpoch = useCurrentEpoch()
const collapsed = ref<Record<string, boolean>>({})
const listEl = ref<HTMLElement | null>(null)
const allowCollapseAbove = ref(false)

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

const AUTO_BASE_DEPTH = 2
const SIBLING_WINDOW = 0
const RECENT_PATH_LIMIT = 0
const CONTEXT_EXPAND_BUDGET = 10

const recentPathHistory = ref<string[][]>([])

const indexTree = (start: EpochNode) => {
  const depthById: Record<string, number> = {}
  const branchIds: string[] = []

  const walk = (node: EpochNode, depth: number) => {
    depthById[node.id] = depth
    if (hasChildren(node)) {
      branchIds.push(node.id)
    }
    for (const child of node.children) {
      walk(child, depth + 1)
    }
  }

  walk(start, 0)
  return { depthById, branchIds }
}

watch(() => currentPath.value.map(node => node.id), (ids) => {
  if (ids.length === 0) return
  const key = ids.join('>')
  const deduped = recentPathHistory.value.filter(path => path.join('>') !== key)
  recentPathHistory.value = [ids, ...deduped].slice(0, RECENT_PATH_LIMIT)
}, { immediate: true })

const runAutoCollapse = () => {
  if (!root.value) return

  const { depthById, branchIds } = indexTree(root.value)
  const activeIds = activePathIds.value
  const nextCollapsed: Record<string, boolean> = {}

  // Start fully collapsed for all branches.
  for (const id of branchIds) {
    nextCollapsed[id] = true
  }

  const expandBranch = (id: string) => {
    if (nextCollapsed[id] !== undefined) {
      nextCollapsed[id] = false
    }
  }

  // Priority 1: active path is always expanded.
  for (const id of activeIds) {
    expandBranch(id)
  }

  // Priority 2: keep top levels expanded for orientation stability.
  for (const id of branchIds) {
    if ((depthById[id] ?? 999) < AUTO_BASE_DEPTH) {
      expandBranch(id)
    }
  }

  // Priority 3: expand sibling window around active child at each path level.
  const contextCandidates: string[] = []
  const path = currentPath.value
  for (let i = 0; i < path.length - 1; i += 1) {
    const parent = path[i]
    const activeChild = path[i + 1]
    const activeIndex = parent.children.findIndex(child => child.id === activeChild.id)
    if (activeIndex < 0) continue

    const start = Math.max(0, activeIndex - SIBLING_WINDOW)
    const end = Math.min(parent.children.length - 1, activeIndex + SIBLING_WINDOW)
    for (let j = start; j <= end; j += 1) {
      contextCandidates.push(parent.children[j].id)
    }
  }

  // Priority 4: keep a tiny memory of recently active branches open.
  const recentCandidates: string[] = []
  for (const historyPath of recentPathHistory.value) {
    for (const id of historyPath) {
      recentCandidates.push(id)
    }
  }

  let expansionsUsed = 0
  const applyCandidate = (id: string) => {
    if (activeIds.has(id)) return
    if (nextCollapsed[id] === undefined) return
    if (nextCollapsed[id] === false) return
    if (expansionsUsed >= CONTEXT_EXPAND_BUDGET) return
    nextCollapsed[id] = false
    expansionsUsed += 1
  }

  for (const id of contextCandidates) {
    applyCandidate(id)
  }
  for (const id of recentCandidates) {
    applyCandidate(id)
  }

  // Keep already-open branches above the active node stable unless we hit
  // the lower scroll trigger and explicitly allow collapsing above.
  if (!allowCollapseAbove.value) {
    const aboveBranchIds = new Set<string>()
    let reachedActive = false
    const collectAbove = (node: EpochNode) => {
      if (reachedActive) return
      if (node.id === currentEpoch.value.id) {
        reachedActive = true
        return
      }
      if (hasChildren(node)) {
        aboveBranchIds.add(node.id)
      }
      for (const child of node.children) {
        collectAbove(child)
        if (reachedActive) return
      }
    }
    collectAbove(root.value)

    for (const id of aboveBranchIds) {
      if (collapsed.value[id] === false) {
        nextCollapsed[id] = false
      }
    }
  }

  collapsed.value = nextCollapsed
}

watch([() => currentEpoch.value.id, root, recentPathHistory], runAutoCollapse, { immediate: true })

const visibleNodes = computed<VisibleNode[]>(() => {
  const output: VisibleNode[] = []
  if (!root.value) return output

  const walk = (node: EpochNode, depth: number) => {
    output.push({ node, depth })
    if (!isExpanded(node)) return
    for (const child of node.children) {
      walk(child, depth + 1)
    }
  }

  walk(root.value, 0)
  return output
})

const indentStep = 14
const indentBase = 8

const guideLeft = (level: number) => {
  return `${indentBase + (level - 1) * indentStep + 6}px`
}

const handleClickNode = (node: EpochNode) => {
  jumpToEpoch(node.id)
}

const scrollCurrentIntoView = async () => {
  await nextTick()
  const container = listEl.value
  if (!container) return
  const selector = `[data-epoch-id="${currentEpoch.value.id}"]`
  const row = container.querySelector<HTMLElement>(selector)
  if (!row) return

  const containerRect = container.getBoundingClientRect()
  const rowRect = row.getBoundingClientRect()

  // Keep a safe zone to reduce scroll frequency.
  const topBuffer = 48
  const bottomBuffer = 48
  const safeTop = containerRect.top + topBuffer
  const safeBottom = containerRect.bottom - bottomBuffer

  // If the current row is near/beyond the bottom, move it toward the top.
  if (rowRect.bottom > safeBottom) {
    allowCollapseAbove.value = true
    runAutoCollapse()
    allowCollapseAbove.value = false
    await nextTick()

    const adjustedRow = container.querySelector<HTMLElement>(selector)
    if (!adjustedRow) return
    const adjustedRect = adjustedRow.getBoundingClientRect()

    const targetOffsetFromTop = 28
    const targetTop = containerRect.top + targetOffsetFromTop
    const delta = adjustedRect.top - targetTop
    container.scrollTo({
      top: container.scrollTop + delta,
      behavior: 'smooth',
    })
    return
  }

  // If it drifts above the top safe zone, bring it back into view.
  if (rowRect.top < safeTop) {
    const targetOffsetFromBottom = 28
    const targetTop = containerRect.bottom - rowRect.height - targetOffsetFromBottom
    const delta = rowRect.top - targetTop
    container.scrollTo({
      top: container.scrollTop + delta,
      behavior: 'smooth',
    })
  }
}

const traverseTimeline = async () => {
  const previous = currentEpoch.value
  let unwatch = null as (() => void) | null

  const { pushHandler } = useErrorHandler()
  const popHandler = pushHandler((err, instance, info, next) => {
    console.error('Error traversing timeline:', err)
  }, 100)

  const doTraversal = () => new Promise((resolve) => {
    console.log('👉 doTraversal')
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

onMounted(async () => {
  await nextTick()
  if (currentEpoch.value.id !== '__TOP_EPOCH__') {
    await traverseTimeline()
  }
})

watch(() => currentEpoch.value.id, scrollCurrentIntoView, { immediate: true })

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
        v-for="{ node, depth } in visibleNodes"
        :key="node.id"
        :data-epoch-id="node.id"
        class="outline-row"
        relative
        flex="~ items-center gap-1"
        text-sm
        :style="{ paddingLeft: `${depth * indentStep + indentBase}px` }"
        :class="[
          isCurrent(node) ? 'font-bold text-blue-500' : '',
          !isCurrent(node) && isAncestor(node) ? 'font-semibold text-gray-600' : '',
          !isCurrent(node) && !isAncestor(node) ? 'text-gray-400' : '',
        ]"
      >
        <div
          v-if="depth > 0"
          class="pointer-events-none absolute inset-y-0 left-0"
        >
          <span
            v-for="level in depth"
            :key="`${node.id}-guide-${level}`"
            class="absolute inset-y-0 w-px bg-gray-200"
            :style="{ left: guideLeft(level) }"
          />
        </div>
        <!-- {{ node.children.length }} -->
        <button
          v-if="hasChildren(node)"
          @click.stop="toggleCollapse(node)"
          w-4 h-4
          flex-center
          rounded
          hover:bg-gray-200
          :title="isPinned(node) ? 'Pinned ancestor' : (isExpanded(node) ? 'Collapse' : 'Expand')"
        >
          <span :class="isExpanded(node) ? 'i-mdi-chevron-down' : 'i-mdi-chevron-right'" />
        </button>
        <div v-else w-4 h-4 flex-center i-mdi-circle-outline scale-60 ></div>

        <span truncate @click="handleClickNode(node)" cursor-pointer >{{ node._name }}</span>
          

      </div>
    </div>
  </div>
</template>
