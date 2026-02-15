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
  console.log('currentPath', path)
  return path.reverse()
})

const currentPathIds = computed(() => {
  return new Set(currentPath.value.map(node => node.id))
})

const ancestorPath = computed(() => {
  return currentPath.value.slice(0, -1)
})

const ancestorIds = computed(() => {
  return new Set(ancestorPath.value.map(node => node.id))
})

const hasChildren = (node: EpochNode) => node.children.length > 0
const isCurrent = (node: EpochNode) => node.id === currentEpoch.value.id
const isAncestor = (node: EpochNode) => ancestorIds.value.has(node.id)
const isPinned = (node: EpochNode) => isAncestor(node)

const isExpanded = (node: EpochNode) => {
  return hasChildren(node) && (isPinned(node) || !collapsed.value[node.id])
}

const toggleCollapse = (node: EpochNode) => {
  if (!hasChildren(node) || isPinned(node)) return
  collapsed.value[node.id] = isExpanded(node)
}

watch(currentPathIds, (ids) => {
  for (const id of ids) {
    collapsed.value[id] = false
  }
}, { immediate: true })

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
</script>

<template>
  <div rounded-lg border="~ 2 gray-300" bg-white p-3>
    <div text-sm font-semibold text-gray-700 mb-2>Epoch Outline</div>

    <div v-if="!root" text-sm text-gray-500>
      Waiting for first epoch...
    </div>

    <div v-else>
      <div
        v-if="ancestorPath.length > 0"
        sticky top-0 z-1
        bg="white/95"
        backdrop-blur-sm
        border="~ 1 gray-200"
        rounded-md
        p-2
        mb-2
      >
        <div text="10px gray-500 uppercase" tracking-wider mb-1>Pinned ancestors</div>
        <div flex="~ wrap gap-1">
          <span
            v-for="node in ancestorPath"
            :key="`pin-${node.id}`"
            px-2 py-0.5
            rounded
            text-xs
            bg-amber-100
            text-amber-900
          >
            {{ node._name }}
          </span>
        </div>
      </div>

      <div max-h-130 overflow-y-auto pr-1>
        <div
          v-for="{ node, depth } in visibleNodes"
          :key="node.id"
          class="outline-row"
          rounded
          px-2
          py-1
          mb-0.5
          flex="~ items-center gap-1"
          :style="{ paddingLeft: `${depth * 14 + 8}px` }"
          :class="[
            isCurrent(node) ? 'bg-blue-100 text-blue-900 font-semibold ring-1 ring-blue-300' : '',
            !isCurrent(node) && isAncestor(node) ? 'bg-amber-50 text-amber-900 font-medium' : '',
            !isCurrent(node) && !isAncestor(node) ? 'text-gray-700 hover:bg-gray-100' : '',
          ]"
          @click="toggleCollapse(node)"
        >
          <button
            v-if="hasChildren(node)"
            @click.stop="toggleCollapse(node)"
            w-4 h-4
            flex-center
            rounded
            text-gray-500
            hover:bg-gray-200
            :title="isPinned(node) ? 'Pinned ancestor' : (isExpanded(node) ? 'Collapse' : 'Expand')"
          >
            <span :class="isExpanded(node) ? 'i-mdi-chevron-down' : 'i-mdi-chevron-right'" />
          </button>
          <span v-else w-4 h-4 />

          <span truncate>{{ node._name }}</span>

          <span
            v-if="isPinned(node)"
            i-mdi-pin
            text-amber-700
            ml-auto
            title="Pinned ancestor"
          />
        </div>
      </div>
    </div>
  </div>
</template>
