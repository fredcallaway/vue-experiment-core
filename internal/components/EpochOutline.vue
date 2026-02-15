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

const indentStep = 14
const indentBase = 8

const guideLeft = (level: number) => {
  return `${indentBase + (level - 1) * indentStep + 6}px`
}
</script>

<template>
  <div rounded-lg border="~ 2 gray-300" bg-white p-3>

    <div v-if="!root" text-sm text-gray-500>
      Waiting for first epoch...
    </div>

    <div v-else>
      <div max-h-130 overflow-y-auto pr-1>
        <div
          v-for="{ node, depth } in visibleNodes"
          :key="node.id"
          class="outline-row"
          relative
          rounded
          px-2
          py-1
          mb-0.5
          flex="~ items-center gap-1"
          :style="{ paddingLeft: `${depth * indentStep + indentBase}px` }"
          :class="[
            isCurrent(node) ? 'font-bold text-blue-500' : '',
            !isCurrent(node) && isAncestor(node) ? 'font-semibold text-gray-600' : '',
            !isCurrent(node) && !isAncestor(node) ? 'text-gray-400 hover:bg-gray-100' : '',
          ]"
          @click="toggleCollapse(node)"
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
        </div>
      </div>
    </div>
  </div>
</template>
