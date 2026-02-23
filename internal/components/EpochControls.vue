<script lang="ts" setup>
import type { EpochNode } from '../composables/useEpochTree'

const currentEpoch = useCurrentEpoch()
const fast = useFastMode()
const { root, isTraversing, traverseTimeline } = useEpochTree()

const hasChildren = (node: EpochNode) => node.children.length > 0

const findPreviousLeafId = (start: EpochNode, targetId: string): string | null => {
  let previousLeafId: string | null = null

  const walk = (node: EpochNode): 'found' | 'missing' => {
    if (node.id === targetId) return 'found'
    if (!hasChildren(node)) {
      previousLeafId = node.id
    }
    for (const child of node.children) {
      const result = walk(child)
      if (result === 'found') return 'found'
    }
    return 'missing'
  }

  return walk(start) === 'found' ? previousLeafId : null
}

const backTargetId = computed(() => {
  if (!root.value) return null
  return findPreviousLeafId(root.value, currentEpoch.value.id)
})

const handleBack = async () => {
  const targetId = backTargetId.value
  if (!targetId) return
  await jumpToEpoch(targetId)
}

const handleNext = () => {
  currentEpoch.value.done()
}

const handleReindex = () => {
  void traverseTimeline()
}

</script>

<template>
  <div bg-gray-100 p-2 rounded-lg flex="~ items-center gap-2" >
    <IconButton
      icon="i-mdi-arrow-left-bold-box"
      title="Previous Epoch"
      :disabled="!backTargetId || isTraversing || isJumping"
      @click="handleBack"
    />
    <IconButton
      icon="i-mdi-arrow-right-bold-box"
      title="Next Epoch"
      :disabled="isTraversing || isJumping"
      @click="handleNext"
    />
    <IconButton
      icon="i-mdi-refresh"
      title="Reindex Timeline"
      :disabled="isTraversing || isJumping"
      @click="handleReindex"
    />
    <IconToggle v-model="fast" label="Fast Mode" icon="i-mdi-speedometer" />
  </div>
</template>
