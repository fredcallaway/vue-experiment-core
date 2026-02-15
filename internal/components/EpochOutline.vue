<script lang="ts" setup>

const currentEpoch = useCurrentEpoch()

const tree = ref<string>('') as any

// watch currentEpoch to ensure the tree is up to date
watchImmediate(currentEpoch, () => {
  const root = TOP_EPOCH.children[0]
  if (!root) return
  const buildTree = (epoch: any, indent = 0): string => {
    // const prefix = '    '.repeat(indent)
    const prefix = ''
    let result = prefix + epoch.id + '\n'
    for (const child of epoch.children) {
      result += buildTree(child, indent + 1)
    }
    return result
  }
  tree.value = buildTree(root)
})


</script>

<template>
  <div>
    <pre>{{ tree }}</pre>
  </div>
</template>