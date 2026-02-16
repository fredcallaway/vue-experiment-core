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

const runAutoCollapse = () => {
  if (!root.value) return
  if (isTraversing.value) return

  console.log('👉 runAutoCollapse', allowCollapseAbove.value)

  const { depthById, branchIds } = indexTree(root.value)
  const activeIds = activePathIds.value
  const branchSet = new Set(branchIds)
  const nextCollapsed: Record<string, boolean> = { ...collapsed.value }

  // Drop stale state entries for branches that no longer exist.
  for (const id of Object.keys(nextCollapsed)) {
    if (!branchSet.has(id)) {
      delete nextCollapsed[id]
    }
  }

  // Initialize unseen branches as collapsed.
  for (const id of branchIds) {
    if (nextCollapsed[id] === undefined) {
      nextCollapsed[id] = true
    }
  }

  const expandBranch = (id: string) => {
    if (nextCollapsed[id] !== undefined) {
      nextCollapsed[id] = false
    }
  }
  const collapseBranch = (id: string) => {
    if (nextCollapsed[id] !== undefined) {
      nextCollapsed[id] = true
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

  const aboveBranchIds = getAboveSiblingBranchIds()
  // Above siblings should only auto-collapse in lower-trigger mode.
  if (allowCollapseAbove.value) {
    for (const id of aboveBranchIds) {
      collapseBranch(id)
    }
  } else {
    for (const id of aboveBranchIds) {
      expandBranch(id)
    }
  }

  collapsed.value = nextCollapsed
}

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

  const effectiveScale = scale.value || 1
  const containerRect = container.getBoundingClientRect()
  const rowRect = row.getBoundingClientRect()
  const rowTop = (rowRect.top - containerRect.top) / effectiveScale
  const rowBottom = (rowRect.bottom - containerRect.top) / effectiveScale
  const rowHeight = rowBottom - rowTop

  // Keep a safe zone to reduce scroll frequency.
  const topBuffer = 48
  const bottomBuffer = 48
  const safeTop = topBuffer
  const safeBottom = container.clientHeight - bottomBuffer

  // If the current row is near/beyond the bottom, move it toward the top.
  if (rowBottom > safeBottom) {
    console.log('scroll', rowBottom, safeBottom)
    allowCollapseAbove.value = true
    runAutoCollapse()
    allowCollapseAbove.value = false
    await nextTick()

    const adjustedRow = container.querySelector<HTMLElement>(selector)
    if (!adjustedRow) return
    const adjustedRect = adjustedRow.getBoundingClientRect()
    const adjustedTop = (adjustedRect.top - containerRect.top) / effectiveScale

    const targetOffsetFromTop = 28
    const delta = adjustedTop - targetOffsetFromTop
    container.scrollTo({
      top: container.scrollTop + delta,
      behavior: 'smooth',
    })
    return
  }

  // If it drifts above the top safe zone, bring it back into view.
  if (rowTop < safeTop) {
    const targetOffsetFromBottom = 28
    const targetTop = container.clientHeight - rowHeight - targetOffsetFromBottom
    const delta = rowTop - targetTop
    container.scrollTo({
      top: container.scrollTop + delta,
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

onMounted(async () => {
  await nextTick()
  if (currentEpoch.value.id !== '__TOP_EPOCH__') {
    await traverseTimeline()
  }
})

// don't change
watch(currentEpoch, (epoch) => {
  if (epoch.children.length == 0) {  // only run on leaf epochs
    if (isTraversing.value || isJumping.value) return
    console.log('🟢 runAutoCollapse on leaf epoch', epoch.id)
    runAutoCollapse()
    scrollCurrentIntoView()
  }
})

// run auto collapse after traverse or jump
watch(() => isTraversing.value || isJumping.value, (value) => {
  if (value) return
  runAutoCollapse()
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
