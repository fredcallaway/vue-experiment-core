import type { Epoch } from '../../composables/useEpoch'

export type EpochNode = {
  id: string
  name: string
  parent: EpochNode | null
  children: EpochNode[]
  nSteps?: number
  hasIdenticalChildren?: boolean
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
    : `${targetPrefix}-${source.name}`
  let name = source.name

  // Pseudo leaves in IndexableEpochs include the step in their name.
  // Keep those names in sync with the cloned step.
  if (isDirectChild && source.name === `leaf_${sourceStep}`) {
    name = `leaf_${targetStep}`
    id = `${targetPrefix}-${name}`
  }

  const clone: EpochNode = {
    id,
    name: name,
    parent: parent,
    children: [],
    nSteps: source.nSteps,
    hasIdenticalChildren: source.hasIdenticalChildren,
  }
  clone.children = source.children.map(child =>
    cloneSubtreeForStep(child, clone, sourcePrefix, targetPrefix, sourceStep, targetStep, false)
  )
  return clone
}

const shouldCloneIdenticalChildren = (node: EpochNode) => {
  return node.hasIdenticalChildren === true
    && Number.isInteger(node.nSteps)
    && (node.nSteps ?? 0) > 0
    && node.children.length > 0
    && node.children.length < (node.nSteps ?? 0)
}

const materializeIdenticalChildren = (node: EpochNode) => {
  if (!shouldCloneIdenticalChildren(node)) return

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
  node.children = completeChildren
}

const cloneEpochTree = (source: Epoch, parent: EpochNode | null): EpochNode => {
  const rawStepCount = (source as { nSteps?: unknown }).nSteps
  const clone: EpochNode = {
    id: source.id,
    name: source._name,
    parent: parent,
    children: [],
    nSteps: typeof rawStepCount === 'number' ? rawStepCount : undefined,
    hasIdenticalChildren: source.hasIdenticalChildren,
  }
  clone.children = source.children.map(child => cloneEpochTree(child, clone))
  materializeIdenticalChildren(clone)
  return clone
}

const findTreeNode = (node: EpochNode, id: string): EpochNode | null => {
  if (node.id === id) return node
  for (const child of node.children) {
    const found = findTreeNode(child, id)
    if (found) return found
  }
  return null
}

const upsertCurrentPath = (root: EpochNode, current: Epoch) => {
  if (findTreeNode(root, current.id)) return

  const livePath: Epoch[] = []
  let node: Epoch = current
  while (node._name !== '__TOP_EPOCH__') {
    livePath.push(node)
    node = node._parent
  }
  livePath.reverse()
  if (livePath.length === 0 || livePath[0].id !== root.id) return

  let parent = root
  for (let i = 1; i < livePath.length; i += 1) {
    const live = livePath[i]
    let child = parent.children.find(existing => existing.id === live.id) ?? null
    if (child) {
      parent = child
      continue
    }

    child = cloneEpochTree(live, parent)
    if (parent.hasIdenticalChildren) {
      const step = getStepIndex(parent.id, live.id)
      if (step !== null) {
        const existingStepIndex = parent.children.findIndex(existing =>
          getStepIndex(parent.id, existing.id) === step
        )
        if (existingStepIndex >= 0) {
          parent.children[existingStepIndex] = child
        } else {
          parent.children.push(child)
        }
      } else {
        parent.children.push(child)
      }
    } else {
      parent.children.push(child)
    }
    parent = child
  }
}

export const useEpochTree = () => {
  const currentEpoch = useCurrentEpoch()

  const root = ref<EpochNode | null>(null)
  const isTraversing = ref(false)
  const hasTraversed = ref(false)

  const refreshTree = () => {
    const source = TOP_EPOCH.children[0]
    root.value = source ? cloneEpochTree(source, null) : null
    if (root.value) {
      upsertCurrentPath(root.value, currentEpoch.value)
    }
  }

  const traverseTimeline = async () => {
    if (isTraversing.value) return
    console.groupCollapsed('traverseTimeline')
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
      setCurrentEpoch(TOP_EPOCH.children[0])
      await jumpToEpoch(previous.id)
      refreshTree()
      console.groupEnd()
      console.timeEnd('traverseTimeline')
    }
  }

  watchOnce(currentEpoch, () => {
    refreshTree()
  })

  watch(currentEpoch, () => {
    if (isTraversing.value) return
    refreshTree()
  })

  // We step through the full experiment to discover epochs (nodes)
  // NOTE: this will miss epochs that are not always created (e.g. because condition or randomness)
  onMounted(async () => {
    if (currentEpoch.value.id !== '__TOP_EPOCH__') {
      await traverseTimeline()
    }
  })

  return {
    root,
    refreshTree,
    isTraversing,
    hasTraversed,
    traverseTimeline,
  }
}
