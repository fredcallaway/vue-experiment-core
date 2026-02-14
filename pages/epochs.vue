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

type DisplayNode = {
  token: string
  prefix: string
  depth: number
  count: number
  childCount: number
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
const collapsedPrefixes = ref<Set<string>>(new Set())

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

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
}

const sortTokens = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true })

const toggleCollapsed = (prefix: string) => {
  const next = new Set(collapsedPrefixes.value)
  if (next.has(prefix)) {
    next.delete(prefix)
  } else {
    next.add(prefix)
  }
  collapsedPrefixes.value = next
}

const visibleNodes = computed<DisplayNode[]>(() => {
  const rows: DisplayNode[] = []

  const visit = (node: EpochTreeNode, depth: number) => {
    const children = Object.values(node.children).sort((a, b) => sortTokens(a.token, b.token))
    for (const child of children) {
      rows.push({
        token: child.token,
        prefix: child.prefix,
        depth,
        count: child.count,
        childCount: Object.keys(child.children).length,
      })

      if (!collapsedPrefixes.value.has(child.prefix)) {
        visit(child, depth + 1)
      }
    }
  }

  visit(rootNode.value, 0)
  return rows
})

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
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    isBuilding.value = false
  }
}

const jumpToPrefix = async (prefix: string) => {
  if (!prefix || isBuilding.value) return
  await jumpToEpoch(prefix)
}

onMounted(async () => {
  await runTraversal()
})
</script>

<template>
  <div p-4>
    <div mb-4 flex="~ items-center gap-3 wrap">
      <button
        class="px-3 py-1 rounded bg-blue-600 text-white disabled:opacity-40"
        :disabled="isBuilding"
        @click="runTraversal"
      >
        {{ hasBuilt ? 'Rebuild Tree' : 'Build Tree' }}
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

    <div border="~ gray-200" rounded p-3 max-h="70vh" overflow-auto bg-white>
      <div v-if="visibleNodes.length === 0" text-sm text-gray-500>
        No epoch nodes discovered yet.
      </div>

      <div
        v-for="node in visibleNodes"
        :key="node.prefix"
        class="flex items-center gap-2 py-0.5 font-mono text-sm"
        :style="{ paddingLeft: `${node.depth * 14}px` }"
      >
        <button
          class="w-5 text-gray-400 hover:text-gray-700"
          :disabled="node.childCount === 0"
          @click="toggleCollapsed(node.prefix)"
        >
          {{ node.childCount === 0 ? '·' : (collapsedPrefixes.has(node.prefix) ? '+' : '−') }}
        </button>

        <button
          class="text-left hover:text-blue-700"
          @click="jumpToPrefix(node.prefix)"
        >
          {{ node.token }}
        </button>

        <span text-xs text-gray-400>
          seen {{ node.count }}x
        </span>
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
