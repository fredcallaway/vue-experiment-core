import type { Epoch } from '../../composables/useEpoch'

export type EpochNode = {
  id: string
  name: string
  parent: EpochNode | null
  children: EpochNode[]
  nSteps?: number
  hasIdenticalChildren?: boolean
  error?: string
}

type SerializedEpochNode = Omit<EpochNode, 'parent' | 'children'> & {
  children: SerializedEpochNode[]
}

type CachedEpochOutline = {
  savedAt: number
  root: SerializedEpochNode
}

// The outline is cached per page, keyed by the page's route path. We key on the route rather
// than the root epoch id because two pages can legitimately share a root epoch name (e.g. an
// unnamed <ESequence> defaults to "ESequence"), which would collide in the cache and leak one
// page's outline into another. This lets each page keep its own outline and rebuild on switch.
const OUTLINE_CACHE_PREFIX = 'epoch-outline'
const OUTLINE_CACHE_MAX_AGE_MS = 60_000
const outlineCacheKey = (pageKey: string) => `${OUTLINE_CACHE_PREFIX}:${pageKey}`
const outlineScanAttemptKey = (pageKey: string) => `${outlineCacheKey(pageKey)}:scan-attempted`

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

const formatEpochError = (err: unknown) => {
  if (err instanceof Error) return err.message || err.name
  if (typeof err === 'string') return err
  try {
    return JSON.stringify(err)
  } catch {
    return String(err)
  }
}

const serializeEpochNode = (node: EpochNode): SerializedEpochNode => ({
  id: node.id,
  name: node.name,
  nSteps: node.nSteps,
  hasIdenticalChildren: node.hasIdenticalChildren,
  error: node.error,
  children: node.children.map(serializeEpochNode),
})

const hydrateEpochNode = (node: SerializedEpochNode, parent: EpochNode | null = null): EpochNode => {
  const hydrated: EpochNode = {
    ...node,
    parent,
    children: [],
  }
  hydrated.children = node.children.map(child => hydrateEpochNode(child, hydrated))
  return hydrated
}

const isFreshOutlineCache = (cached: CachedEpochOutline) => {
  return Date.now() - cached.savedAt < OUTLINE_CACHE_MAX_AGE_MS
}

const cloneEpochTree = (
  source: Epoch,
  parent: EpochNode | null,
  errorsById: Record<string, string>,
): EpochNode => {
  const rawStepCount = (source as { nSteps?: unknown }).nSteps
  const clone: EpochNode = {
    id: source.id,
    name: source._name,
    parent: parent,
    children: [],
    nSteps: typeof rawStepCount === 'number' ? rawStepCount : undefined,
    hasIdenticalChildren: source.hasIdenticalChildren,
    error: errorsById[source.id],
  }
  clone.children = source.children.map(child => cloneEpochTree(child, clone, errorsById))
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

const getLivePath = (current: Epoch) => {
  const livePath: Epoch[] = []
  let node: Epoch = current
  while (node._name !== '__TOP_EPOCH__') {
    livePath.push(node)
    node = node._parent
  }
  return livePath.reverse()
}

// The current page's root epoch (e.g. "experiment", "DemoPhases"). Derived from the live
// path rather than TOP_EPOCH.children[0]: epochs are never removed from TOP_EPOCH.children
// on unmount, so after navigating between pages [0] is whichever page mounted first, not the
// current one. Falls back to the first mounted root when at TOP_EPOCH.
const getLiveRoot = (current: Epoch): Epoch | null => {
  const livePath = getLivePath(current)
  if (livePath.length > 0) return livePath[0]
  return TOP_EPOCH.children[0] ?? null
}

// The id of the current page's root epoch, used to scope the outline cache per page.
const getLiveRootId = (current: Epoch): string | null => {
  return getLiveRoot(current)?.id ?? null
}

const upsertCurrentPath = (
  root: EpochNode,
  current: Epoch,
  errorsById: Record<string, string>,
) => {
  if (findTreeNode(root, current.id)) return

  const livePath = getLivePath(current)
  if (livePath.length === 0 || livePath[0].id !== root.id) return

  let parent = root
  for (let i = 1; i < livePath.length; i += 1) {
    const live = livePath[i]
    let child = parent.children.find(existing => existing.id === live.id) ?? null
    if (child) {
      parent = child
      continue
    }

    child = cloneEpochTree(live, parent, errorsById)
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

export const useEpochTree = createGlobalState(() => {
  const currentEpoch = useCurrentEpoch()
  const route = useRoute()
  // The page the current outline belongs to. Used to key the cache and detect page switches.
  const pageKey = () => route.path

  const root = ref<EpochNode | null>(null)
  const isTraversing = ref(false)
  const hasTraversed = ref(false)
  const isLoadedFromCache = ref(false)
  const cacheSavedAt = ref<number | null>(null)
  const isOutlineStale = ref(false)
  const outlineStaleReason = ref<string | null>(null)
  const errorsById = ref<Record<string, string>>({})
  const hasInitializedOutline = ref(false)
  // The page key the current outline belongs to. Used to detect page switches.
  const loadedPageKey = ref<string | null>(null)
  let isMounted = false

  const canUseLocalStorage = () => import.meta.client && typeof localStorage !== 'undefined'

  const clearCachedOutline = (key = loadedPageKey.value) => {
    if (!canUseLocalStorage() || !key) return
    localStorage.removeItem(outlineCacheKey(key))
    localStorage.removeItem(outlineScanAttemptKey(key))
    cacheSavedAt.value = null
    isOutlineStale.value = false
    outlineStaleReason.value = null
  }

  const loadCachedOutline = (key: string) => {
    if (!canUseLocalStorage()) return null
    const raw = localStorage.getItem(outlineCacheKey(key))
    if (!raw) return null

    try {
      const cached = JSON.parse(raw) as CachedEpochOutline
      if (!cached || typeof cached.savedAt !== 'number' || !cached.root || !isFreshOutlineCache(cached)) {
        return null
      }
      return cached
    } catch (error) {
      console.warn('Failed to parse cached epoch outline:', error)
      localStorage.removeItem(outlineCacheKey(key))
      return null
    }
  }

  const saveCachedOutline = (node: EpochNode) => {
    if (!canUseLocalStorage()) return null
    const cached: CachedEpochOutline = {
      savedAt: Date.now(),
      root: serializeEpochNode(node),
    }
    localStorage.setItem(outlineCacheKey(pageKey()), JSON.stringify(cached))
    cacheSavedAt.value = cached.savedAt
    isOutlineStale.value = false
    outlineStaleReason.value = null
    return cached
  }

  const markOutlineStale = (reason: string) => {
    if (!isOutlineStale.value) {
      console.warn(reason)
    }
    isOutlineStale.value = true
    outlineStaleReason.value = reason
  }

  const clearOutlineStale = () => {
    if (!isOutlineStale.value) return
    console.info('Cached epoch outline recovered: current epoch is present in the cached outline.')
    isOutlineStale.value = false
    outlineStaleReason.value = null
  }

  const syncCachedOutlineForCurrentEpoch = (cachedRoot: EpochNode, current: Epoch) => {
    const livePath = getLivePath(current)
    if (livePath.length === 0) return true
    if (findTreeNode(cachedRoot, current.id)) {
      clearOutlineStale()
      return true
    }

    if (livePath[0].id !== cachedRoot.id) {
      markOutlineStale(
        `Cached epoch outline is stale: live root "${livePath[0].id}" does not match cached root "${cachedRoot.id}". Reindex Timeline.`,
      )
      return false
    }

    upsertCurrentPath(cachedRoot, current, errorsById.value)
    return true
  }

  const markCachedOutlineStale = (reason: string) => {
    markOutlineStale(reason)
  }

  const refreshTree = () => {
    if (isLoadedFromCache.value && root.value) {
      syncCachedOutlineForCurrentEpoch(root.value, currentEpoch.value)
      return
    }

    const source = getLiveRoot(currentEpoch.value)
    root.value = source ? cloneEpochTree(source, null, errorsById.value) : null
    if (root.value) {
      loadedPageKey.value = pageKey()
      upsertCurrentPath(root.value, currentEpoch.value, errorsById.value)
    }
  }

  type TraverseTimelineOptions = {
    saveAndReload?: boolean
    force?: boolean
  }

  const traverseTimeline = async (options: TraverseTimelineOptions = {}) => {
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
      const epochId = currentEpoch.value.id
      if (epochId !== '__TOP_EPOCH__') {
        errorsById.value = {
          ...errorsById.value,
          [epochId]: formatEpochError(err),
        }
      }
      console.error('Error traversing timeline:', err)
    }, 100)

    let unwatch = null as (() => void) | null
    let traversalSucceeded = false
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
      traversalSucceeded = true
      console.log('traversal succeeded')
    } catch (error) {
      console.error('Error traversing timeline:', error)
    } finally {
      popHandler()
      unwatch?.()
      isJumping.value = false
      isTraversing.value = false
      await nextTick()
      const liveRoot = getLiveRoot(previous)
      if (liveRoot) setCurrentEpoch(liveRoot)
      await jumpToEpoch(previous.id)
      refreshTree()
      if (traversalSucceeded && options.saveAndReload && root.value) {
        saveCachedOutline(root.value)
        if (canUseLocalStorage()) {
          localStorage.removeItem(outlineScanAttemptKey(pageKey()))
        }
        if (import.meta.client) {
          window.location.reload()
        }
      }
      console.groupEnd()
      console.timeEnd('traverseTimeline')
    }
  }

  const reindexTimeline = async () => {
    clearCachedOutline()
    isLoadedFromCache.value = false
    await traverseTimeline({ saveAndReload: true, force: true })
  }

  const initializeOutline = async () => {
    if (hasInitializedOutline.value) return
    // Wait until the page's root epoch has mounted; otherwise there is nothing to build from
    // (e.g. mid-navigation when currentEpoch is still TOP_EPOCH).
    const rootId = getLiveRootId(currentEpoch.value)
    if (!rootId || rootId === '__TOP_EPOCH__') return

    const key = pageKey()
    hasInitializedOutline.value = true
    loadedPageKey.value = key

    if (!canUseLocalStorage()) {
      console.warn('Epoch outline cache unavailable; falling back to direct traversal')
      await traverseTimeline()
      return
    }

    const cached = loadCachedOutline(key)
    if (cached) {
      root.value = hydrateEpochNode(cached.root)
      isLoadedFromCache.value = true
      cacheSavedAt.value = cached.savedAt
      hasTraversed.value = true
      if (root.value) {
        syncCachedOutlineForCurrentEpoch(root.value, currentEpoch.value)
      }
      return
    }

    if (localStorage.getItem(outlineScanAttemptKey(key))) {
      localStorage.removeItem(outlineScanAttemptKey(key))
      console.warn('Epoch outline scan was already attempted without producing a fresh cache')
      refreshTree()
      return
    }

    localStorage.setItem(outlineScanAttemptKey(key), String(Date.now()))
    await traverseTimeline({ saveAndReload: true })
  }

  // Reset outline state so the next epoch change rebuilds for the new page.
  const resetForPage = () => {
    hasInitializedOutline.value = false
    isLoadedFromCache.value = false
    hasTraversed.value = false
    root.value = null
    cacheSavedAt.value = null
    isOutlineStale.value = false
    outlineStaleReason.value = null
    loadedPageKey.value = null
  }

  const syncOutlineForCurrentPage = async () => {
    if (!isMounted) return
    if (isTraversing.value) return
    // When navigating to a different page, its route differs from the loaded one. Reset and
    // rebuild for the new page rather than showing the old (stale) tree. Keying on the route
    // (not the root epoch id) avoids collisions between pages that share a root epoch name.
    if (loadedPageKey.value && pageKey() !== loadedPageKey.value) {
      resetForPage()
    }
    if (!hasInitializedOutline.value) {
      await initializeOutline()
      return
    }
    refreshTree()
  }

  // React both to epoch changes (tree updates within a page) and route changes (page switches).
  watch([currentEpoch, () => route.path], () => { void syncOutlineForCurrentPage() })

  // We step through the full experiment to discover epochs (nodes)
  // NOTE: this will miss epochs that are not always created (e.g. because condition or randomness)
  onMounted(async () => {
    isMounted = true
    await initializeOutline()
  })

  return {
    root,
    refreshTree,
    isTraversing,
    hasTraversed,
    isLoadedFromCache,
    cacheSavedAt,
    isOutlineStale,
    outlineStaleReason,
    markCachedOutlineStale,
    traverseTimeline,
    reindexTimeline,
    clearCachedOutline,
  }
})
