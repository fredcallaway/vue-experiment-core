<script lang="ts" setup>
import { jumpToEpoch, useCurrentEpoch } from '../../composables/useEpoch'
import { useScrollHandler } from '../../composables/useScrollHandler'
import { assert, assertDefined } from '../../utils/asserts'
import { isJumping } from '../state'
import * as R from 'remeda'
import { useUrlParam } from '../../utils/url-params'
import { useEpochTree } from '../composables/useEpochTree'
import { useMemoize } from '@vueuse/core'

import type { EpochNode } from '../composables/useEpochTree'

const currentEpoch = useCurrentEpoch()
const pinnedEpoch = useUrlParam('jump')
const {
  root,
  isTraversing,
  hasTraversed,
  isOutlineStale,
  outlineStaleReason,
  traversalError,
  markCachedOutlineStale,
  reindexTimeline,
  autoTraverse,
} = useEpochTree()

const reindexTitle = computed(() => {
  if (traversalError.value) return 'Retry outline traversal'
  if (isOutlineStale.value) return outlineStaleReason.value ?? 'Epoch outline is stale. Reindex Timeline.'
  return 'Reindex Timeline'
})

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
  // The list element may not be attached yet when a layout refresh fires during mount
  // (same race scrollCurrentIntoView guards against); bail until it's available.
  const listEl = listElRef.value
  if (!listEl) return
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

  const containerRect = listEl.getBoundingClientRect()
  const activeRect = activeEl.getBoundingClientRect()
  const activeTop = activeRect.top - containerRect.top
  const activeBottom = activeRect.bottom - containerRect.top
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

const handleClickNode = async (node: EpochNode) => {
  if (isOutlineStale.value) {
    console.warn(outlineStaleReason.value ?? 'Epoch outline is stale. Reindex Timeline before jumping.')
  }
  // Target the branch's beginning explicitly: jumpToEpoch preserves shared ancestors,
  // so targeting an active ancestor itself would leave its current descendant unchanged.
  let target = node
  while (target.children.length > 0) target = target.children[0]
  const result = await jumpToEpoch(target.id)
  if (result === null && target.id !== currentEpoch.value.id) {
    markCachedOutlineStale(
      `Cached epoch outline may be stale: jump to "${target.id}" did not resolve. Reindex Timeline.`,
    )
  }
}

const isPinnedNode = (node: EpochNode) => pinnedEpoch.value === node.id

const handlePinNode = async (node: EpochNode) => {
  if (hasChildren(node)) return
  if (isPinnedNode(node)) {
    pinnedEpoch.value = undefined
  } else {
    await jumpToEpoch(node.id)
    pinnedEpoch.value = node.id
  }
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

const indentStep = 14
const indentBase = 8

</script>

<template>
  <div
    class="rounded-lg border border-2 border-gray-300 bg-white cursor-default flex flex-col pr2 relative min-w-170px"
  >
    <h2 class="ml2 mb0 shrink-0">Outline</h2>
    <div class="absolute right-1 top-1 flex flex-items-center flex-gap-1">
      <IconToggle
        v-model="autoTraverse"
        label="Automatic Traversal"
        icon="i-mdi-map-search"
        tutorial-title="Automatic traversal"
        tutorial-help="Keeps the epoch outline indexed automatically as the experiment changes during development."
        tutorial-placement="left"
      />
      <IconButton
        icon="i-mdi-refresh"
        :title="reindexTitle"
        :tone="isOutlineStale || traversalError ? 'danger' : 'default'"
        :disabled="isTraversing || isJumping"
        tutorial-title="Reindex timeline"
        tutorial-help="Rebuilds the cached epoch outline by traversing the experiment timeline."
        tutorial-placement="left"
        @click="reindexTimeline"
      />
    </div>

    <!-- <EpochControls w-fit class="py0! ml2"  /> -->

    <div
      class="mx2 mb2 w-72 shrink-0 rounded border border-red-400 bg-red-50 p2 text-xs text-red-800"
      v-if="traversalError"
      role="alert"
    >
      <div class="font-bold mb1">Outline traversal failed</div>
      <div class="break-words">{{ traversalError.message }}</div>
      <div class="mt1 text-red-700 break-all" v-if="traversalError.epochId">
        After epoch: <code>{{ traversalError.epochId }}</code>
      </div>
      <div class="mt1 text-red-700 break-all" v-if="traversalError.componentPath">
        Component: <code>{{ traversalError.componentPath }}</code>
      </div>
      <div class="mt1">Fix the error, then reindex.</div>
    </div>

    <div class="text-sm text-gray-500" v-if="!root">
      Waiting for first epoch...
    </div>

    <div
      class="overflow-y-auto pr-1 [scrollbar-gutter:stable] [scrollbar-width:thin] [scrollbar-color:rgba(0,0,0,0.2)_transparent] flex-1 min-h-0"
      ref="listEl"
      v-else
    >
      <div
        v-for="row in visibleRows"
        :key="row.node.id"
        :data-epoch-id="row.node.id"
        class="outline-row relative flex flex-items-center flex-gap-1 text-sm"
        :style="{ paddingLeft: `${row.depth * indentStep + indentBase}px` }"
        :class="getNodeTextClass(row.node)"
      >
        <div v-if="row.depth > 0" class="pointer-events-none absolute inset-y-0 left-0">
          <span
            v-for="level in row.depth"
            :key="`${row.node.id}-guide-${level}`"
            class="absolute inset-y-0 w-px bg-gray-100"
            :style="{ left: `${indentBase + (level - 1) * indentStep + 6}px` }"
          />
        </div>

        <TutorialTarget
          class="w-4 h-4 flex flex-wrap justify-center items-center rounded"
          v-if="hasChildren(row.node) && isAncestor(row.node)"
          title="Active ancestor"
          help="This branch contains the current epoch, so it stays expanded and cannot be collapsed."
        >
          <span class="i-mdi-arrow-right-bold" />
        </TutorialTarget>
        <TutorialTarget
          as="button"
          class="w-4 h-4 flex flex-wrap justify-center items-center rounded hover:bg-gray-200"
          v-else-if="hasChildren(row.node)"
          @click.stop="handleToggleCollapse(row.node)"
          :title="isActive(row.node) ? 'Pinned ancestor' : (isExpanded(row.node) ? 'Collapse' : 'Expand')"
          help="Shows or hides this epoch's child epochs in the outline."
        >
          <span :class="isExpanded(row.node) ? 'i-mdi-chevron-down' : 'i-mdi-chevron-right'" />
        </TutorialTarget>
        <TutorialTarget
          as="button"
          v-else
          @click.stop="handlePinNode(row.node)"
          class="group w-4 h-4 flex flex-wrap justify-center items-center rounded hover:bg-gray-100"
          :title="isPinnedNode(row.node) ? 'Unpin' : 'Pin and jump'"
          help="Jumps to this leaf epoch and stores it in the URL as the current jump target."
        >
          <div class="i-mdi-pin text-blue-500" v-if="isPinnedNode(row.node)" />
          <template v-else>
            <div v-if="isCurrent(row.node)" class="group-hover:hidden i-mdi-arrow-right-bold text-blue-500" />
            <div v-else class="group-hover:hidden i-mdi-circle-outline scale-60 text-gray-400" />
            <div class="hidden group-hover:block i-mdi-pin-outline text-gray-300" />
          </template>
        </TutorialTarget>
        <TutorialTarget
          as="span"
          class="truncate cursor-pointer min-w-0"
          @click="handleClickNode(row.node)"
          :title="row.node.error || 'Epoch name'"
          help="Click to jump to this epoch in debug mode. Branch names jump to their first leaf epoch."
        >
          {{ row.node.name }}
        </TutorialTarget>
        <TutorialTarget
          as="button"
          class="ml-1 px-1.5 py-0 translate-y-0.5 rounded-full text-10px cursor-pointer hover:brightness-95"
          v-if="row.identical"
          @click.stop="cycleIdenticalStep(row.node.id, 1)"
          @contextmenu.prevent.stop="cycleIdenticalStep(row.node.id, -1)"
          @wheel="handleScroll(row, $event)"
          title="left/right click or scroll to cycle through steps"
          help="Represents repeated identical child epochs. Click, right-click, or scroll to inspect another step."
          :class="row.identical.activeStep !== null ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-600'"
        >
          {{ row.identical.activeStep !== null ? `${row.identical.activeStep} / ${row.identical.total}` : row.identical.total }}
        </TutorialTarget>
      </div>
    </div>
  </div>
</template>
