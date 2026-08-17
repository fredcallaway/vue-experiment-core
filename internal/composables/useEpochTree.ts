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

export type OutlineTraversalError = {
  message: string
  epochId?: string
  componentName?: string
  componentPath?: string
  info?: string
}

type StoredOutlineTraversalError = {
  savedAt: number
  error: OutlineTraversalError
}

// The outline is cached per page, keyed by the page's route path. We key on the route rather
// than the root epoch id because two pages can legitimately share a root epoch name (e.g. an
// unnamed <ESequence> defaults to "ESequence"), which would collide in the cache and leak one
// page's outline into another. This lets each page keep its own outline and rebuild on switch.
const OUTLINE_CACHE_PREFIX = 'epoch-outline'
const OUTLINE_CACHE_MAX_AGE_MS = 60_000
const outlineCacheKey = (pageKey: string) => `${OUTLINE_CACHE_PREFIX}:${pageKey}`
const outlineScanAttemptKey = (pageKey: string) => `${outlineCacheKey(pageKey)}:scan-attempted`
const outlineTraversalErrorKey = (pageKey: string) => `${outlineCacheKey(pageKey)}:traversal-error`

// Traversal steps the live experiment forward, which leaves page-level state we cannot restore
// (see ADR 0003). So the developer's tab never traverses: a hidden iframe loaded with this flag
// runs the traversal in a throwaway context, saves the cache, and broadcasts an update; the
// developer's tab swaps the new outline into place without reloading.
const OUTLINE_WORKER_FLAG = 'outlineWorker'
const OUTLINE_WORKER_CHANNEL = 'epoch-outline-worker'
const isOutlineWorker = () => import.meta.client && getUrlFlag(OUTLINE_WORKER_FLAG)
// Messages over the worker channel. The consumer asks the worker to (re)traverse a route
// ('request-traversal', e.g. on Reindex or when its cache is missing/diverged); the worker
// announces either a freshly saved cache ('outline-updated') or a traversal failure so consumers
// can swap the outline into place or show the root error.
//
// 'outline-updated' normally carries no payload — the consumer reads the cache the worker just
// wrote. `root` is the fallback for when that write failed (a full localStorage): the outline
// travels over the channel instead, so caching degrades without taking the outline with it.
type OutlineWorkerMessage =
  | { type: 'request-traversal'; pageKey: string }
  | { type: 'outline-updated'; pageKey: string; root?: SerializedEpochNode }
  | { type: 'traversal-failed'; pageKey: string; error: OutlineTraversalError }

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
): EpochNode => {
  const id = source.id.startsWith(sourcePrefix)
    ? `${targetPrefix}${source.id.slice(sourcePrefix.length)}`
    : `${targetPrefix}-${source.name}`

  const clone: EpochNode = {
    id,
    name: source.name,
    parent: parent,
    children: [],
    nSteps: source.nSteps,
    hasIdenticalChildren: source.hasIdenticalChildren,
  }
  clone.children = source.children.map(child =>
    cloneSubtreeForStep(child, clone, sourcePrefix, targetPrefix)
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
      cloneSubtreeForStep(sourceChild, node, sourcePrefix, targetPrefix)
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

// Detect whether the live epoch path is structurally consistent with the cached tree. Epoch ids
// encode position and name (`parentId[index]-name`), so if the experiment's structure changed
// (an epoch added, removed, or renamed) the live path will contain a node whose cached parent has
// a *different* id at the same step index. That mismatch means the cache is outdated and must be
// rebuilt, regardless of its age. Returns false when a conflicting position is found.
const livePathMatchesCache = (root: EpochNode, current: Epoch): boolean => {
  const livePath = getLivePath(current)
  if (livePath.length === 0) return true
  if (livePath[0].id !== root.id) return false

  let parent: EpochNode = root
  for (let i = 1; i < livePath.length; i += 1) {
    const live = livePath[i]
    const byId = parent.children.find(existing => existing.id === live.id)
    if (byId) {
      parent = byId
      continue
    }
    // No id match: if a cached child already occupies this step index but with a different id,
    // the structure has diverged. (A missing index is fine — the live path can legitimately reach
    // epochs the cached traversal hadn't materialized yet.)
    const step = getStepIndex(parent.id, live.id)
    if (step !== null) {
      const occupant = parent.children.find(existing => getStepIndex(parent.id, existing.id) === step)
      if (occupant && occupant.id !== live.id) return false
    }
    return true
  }
  return true
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

  // When off, the outline is built only from the live path (no full traversal of the timeline).
  // This avoids stepping through the whole experiment just to discover epochs.
  const autoTraverse = useSessionStorage('epoch-outline-auto-traverse', true)

  const root = ref<EpochNode | null>(null)
  const isTraversing = ref(false)
  const hasTraversed = ref(false)
  const isLoadedFromCache = ref(false)
  const cacheSavedAt = ref<number | null>(null)
  const isOutlineStale = ref(false)
  const outlineStaleReason = ref<string | null>(null)
  const traversalError = ref<OutlineTraversalError | null>(null)
  const errorsById = ref<Record<string, string>>({})
  const hasInitializedOutline = ref(false)
  // The page key the current outline belongs to. Used to detect page switches.
  const loadedPageKey = ref<string | null>(null)
  let isMounted = false

  const canUseLocalStorage = () => import.meta.client && typeof localStorage !== 'undefined'

  const loadStoredTraversalError = (key: string) => {
    if (!canUseLocalStorage()) return null
    const storageKey = outlineTraversalErrorKey(key)
    const raw = localStorage.getItem(storageKey)
    if (!raw) return null

    try {
      const stored = JSON.parse(raw) as StoredOutlineTraversalError
      if (!stored || typeof stored.savedAt !== 'number' || !stored.error?.message) {
        localStorage.removeItem(storageKey)
        return null
      }
      if (Date.now() - stored.savedAt >= OUTLINE_CACHE_MAX_AGE_MS) {
        localStorage.removeItem(storageKey)
        return null
      }
      return stored.error
    } catch (error) {
      console.warn('Failed to parse stored outline traversal error:', error)
      localStorage.removeItem(storageKey)
      return null
    }
  }

  const clearTraversalError = (key = pageKey()) => {
    traversalError.value = null
    if (canUseLocalStorage()) localStorage.removeItem(outlineTraversalErrorKey(key))
  }

  const storeTraversalError = (key: string, error: OutlineTraversalError) => {
    traversalError.value = error
    if (!canUseLocalStorage()) return
    const stored: StoredOutlineTraversalError = { savedAt: Date.now(), error }
    // Persisting the error is a convenience for the consumer tab. It must never throw here and
    // mask the traversal error it is trying to report.
    try {
      localStorage.setItem(outlineTraversalErrorKey(key), JSON.stringify(stored))
    } catch (writeError) {
      console.warn('Could not persist the outline traversal error:', writeError)
    }
  }

  const clearCachedOutline = (key = loadedPageKey.value) => {
    if (!canUseLocalStorage() || !key) return
    localStorage.removeItem(outlineCacheKey(key))
    localStorage.removeItem(outlineScanAttemptKey(key))
    localStorage.removeItem(outlineTraversalErrorKey(key))
    cacheSavedAt.value = null
    isOutlineStale.value = false
    outlineStaleReason.value = null
    traversalError.value = null
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

  // Evict this app's other cached outlines to make room, then retry. localStorage is shared with
  // everything else on the origin, so a full quota is not necessarily our doing — but our own stale
  // per-page outlines are the one part we can safely reclaim.
  const evictOtherCachedOutlines = (keepKey: string) => {
    const doomed = Object.keys(localStorage).filter(key =>
      key.startsWith(`${OUTLINE_CACHE_PREFIX}:`) && !key.startsWith(outlineCacheKey(keepKey))
    )
    doomed.forEach(key => localStorage.removeItem(key))
    return doomed.length
  }

  const saveCachedOutline = (node: EpochNode) => {
    if (!canUseLocalStorage()) return null
    const key = pageKey()
    const cached: CachedEpochOutline = {
      savedAt: Date.now(),
      root: serializeEpochNode(node),
    }
    const payload = JSON.stringify(cached)

    // A full localStorage must not abort traversal: the outline we just built is still usable
    // in memory, and the worker still needs to broadcast it. Losing the cache only costs a
    // re-traversal on the next load.
    try {
      localStorage.setItem(outlineCacheKey(key), payload)
    } catch (error) {
      const evicted = evictOtherCachedOutlines(key)
      try {
        localStorage.setItem(outlineCacheKey(key), payload)
        console.warn(`Outline cache was full; evicted ${evicted} other cached outline(s) to save this one.`)
      } catch {
        console.warn(
          `Could not cache the epoch outline for ${key}: localStorage is full (${formatEpochError(error)}). `
          + 'The outline still works this session but will be rebuilt on the next load. '
          + 'Clear unused localStorage keys for this origin to restore caching.',
        )
        return null
      }
    }

    clearTraversalError(key)
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

  const rebuildFromLivePath = () => {
    const source = getLiveRoot(currentEpoch.value)
    root.value = source ? cloneEpochTree(source, null, errorsById.value) : null
    if (root.value) {
      loadedPageKey.value = pageKey()
      upsertCurrentPath(root.value, currentEpoch.value, errorsById.value)
    }
  }

  // BroadcastChannel between the hidden worker iframe and the developer's tab. Created lazily and
  // only on the client (it does not exist during SSR).
  const channel = import.meta.client ? new BroadcastChannel(OUTLINE_WORKER_CHANNEL) : null

  const broadcastOutlineUpdated = (key: string, root?: SerializedEpochNode) => {
    channel?.postMessage({ type: 'outline-updated', pageKey: key, root } satisfies OutlineWorkerMessage)
  }

  const reportTraversalError = (
    error: unknown,
    details: Pick<OutlineTraversalError, 'componentName' | 'componentPath' | 'info'> = {},
  ) => {
    // Vue setup failures often cause secondary render/guard failures. Keep and publish the first
    // error because it is the actionable root cause.
    if (traversalError.value) return traversalError.value

    const currentId = currentEpoch.value.id
    const failure: OutlineTraversalError = {
      message: formatEpochError(error),
      epochId: currentId === '__TOP_EPOCH__' ? undefined : currentId,
      ...details,
    }
    const key = pageKey()
    storeTraversalError(key, failure)
    if (isOutlineWorker()) {
      channel?.postMessage({ type: 'traversal-failed', pageKey: key, error: failure } satisfies OutlineWorkerMessage)
    }
    return failure
  }

  const applyWorkerTraversalError = (key: string, error: OutlineTraversalError) => {
    if (key !== pageKey()) return
    traversalError.value = error
    console.error(`Outline traversal failed for ${key}:`, error)
  }

  const syncTraversalErrorFromStorage = (key: string) => {
    if (key !== pageKey()) return
    traversalError.value = loadStoredTraversalError(key)
  }

  // The consumer can't traverse (ADR 0003), so it asks the iframe worker to do it and applies the
  // result when the worker broadcasts 'outline-updated'. Sent on Reindex and when the cache is
  // missing or diverged.
  const requestWorkerTraversal = () => {
    if (isOutlineWorker()) return
    console.debug('Outline: requesting worker traversal for', pageKey())
    channel?.postMessage({ type: 'request-traversal', pageKey: pageKey() } satisfies OutlineWorkerMessage)
  }

  // Swap a worker-produced outline into place without reloading the tab. The worker has just
  // finished a clean traversal, so its tree is authoritative — we do not re-validate it against the
  // consumer's live path here. (After an in-place HMR the consumer's live path can still reference
  // stale epoch instances, which would wrongly fail livePathMatchesCache and drop a valid update.)
  const reloadOutlineFromCache = (key: string, broadcastRoot?: SerializedEpochNode) => {
    if (key !== pageKey()) return
    // Prefer the cache; fall back to an outline sent over the channel when the worker could not
    // write one (a full localStorage).
    const cached = loadCachedOutline(key)
    const serialized = cached?.root ?? broadcastRoot
    if (!serialized) return
    root.value = hydrateEpochNode(serialized)
    traversalError.value = null
    isLoadedFromCache.value = true
    cacheSavedAt.value = cached?.savedAt ?? null
    hasTraversed.value = true
    loadedPageKey.value = key
    syncCachedOutlineForCurrentEpoch(root.value, currentEpoch.value)
    console.info('Outline: applied worker-produced outline for', key)
  }

  const refreshTree = () => {
    if (isLoadedFromCache.value && root.value) {
      // The cached outline can become outdated when the experiment structure changes between
      // sessions. We can't see the whole live tree at once (only the active path is materialized),
      // so we validate incrementally: as navigation reaches each epoch, check the live path still
      // agrees with the cache. On a mismatch, drop the cache and rebuild, re-traversing when
      // automatic traversal is on so the full outline comes back without a manual Reindex.
      if (!livePathMatchesCache(root.value, currentEpoch.value)) {
        console.warn('Cached epoch outline diverged from the live timeline structure; rebuilding.')
        clearCachedOutline(pageKey())
        isLoadedFromCache.value = false
        rebuildFromLivePath()
        // Show the partial live-path outline now; the worker will re-traverse and broadcast a
        // full one shortly (the consumer tab never traverses itself — see ADR 0003).
        if (autoTraverse.value) requestWorkerTraversal()
        return
      }
      syncCachedOutlineForCurrentEpoch(root.value, currentEpoch.value)
      return
    }

    rebuildFromLivePath()
  }

  type TraverseTimelineOptions = {
    save?: boolean
    force?: boolean
  }

  const traverseTimeline = async (options: TraverseTimelineOptions = {}) => {
    if (isTraversing.value) return
    console.groupCollapsed('traverseTimeline')
    console.time('traverseTimeline')
    clearTraversalError(pageKey())

    if (isJumping.value) {
      console.log('waiting for existing jump to complete')
      await until(isJumping).toBe(false)
      console.log('existing jump completed; resuming')
    }

    isTraversing.value = true
    const previous = currentEpoch.value // restored at end
    isJumping.value = true

    let rejectTraversal: ((error: unknown) => void) | null = null
    const { pushHandler } = useErrorHandler()
    const popHandler = pushHandler((err, instance, info) => {
      const epochId = currentEpoch.value.id
      if (epochId !== '__TOP_EPOCH__') {
        errorsById.value = {
          ...errorsById.value,
          [epochId]: formatEpochError(err),
        }
      }
      reportTraversalError(err, {
        componentName: instance?.$options?.__name,
        componentPath: instance?.$options?.__file,
        info,
      })
      console.error('Error traversing timeline:', err)
      rejectTraversal?.(err)
    }, 100)

    let unwatch = null as (() => void) | null
    let traversalSucceeded = false
    // Track which step-less leaves we've visited so a phase epoch that revisits a
    // phase (a possible loop) ends its parent rather than spinning forever.
    const visited = new Set<string>()
    const doTraversal = () => new Promise((resolve, reject) => {
      rejectTraversal = reject
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
        if (!('step' in epoch)) {
          await nextTick()
          // If we've already traversed this leaf, the parent is looping over its
          // children (e.g. a phase epoch revisiting a phase): end the parent.
          if (visited.has(epoch.id)) {
            console.log('  revisited leaf -> ending parent', epoch._parent.id)
            epoch._parent.done()
            return
          }
          visited.add(epoch.id)
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
      reportTraversalError(error)
      console.error('Error traversing timeline:', error)
    } finally {
      rejectTraversal = null
      popHandler()
      unwatch?.()
      isJumping.value = false
      isTraversing.value = false
      await nextTick()
      const liveRoot = getLiveRoot(previous)
      if (liveRoot) setCurrentEpoch(liveRoot)
      // Restore the pre-traversal position. This can throw when the structure changed during the
      // walk (e.g. an HMR edit removed/renamed `previous.id`): the jump fails to find the old epoch.
      // It must not abort the save below — the discovered tree is still valid — so we guard it and,
      // on failure, fall back to the root so the live structure stays mounted for refreshTree.
      try {
        await jumpToEpoch(previous.id)
      } catch (error) {
        console.warn(`Could not restore position to ${previous.id} after traversal; using root.`, error)
        if (liveRoot) await jumpToEpoch(liveRoot.id).catch(() => {})
      }
      refreshTree()
      if (traversalSucceeded && options.save && root.value) {
        const saved = saveCachedOutline(root.value)
        if (canUseLocalStorage()) {
          localStorage.removeItem(outlineScanAttemptKey(pageKey()))
        }
        // The consumer tab listens for this and swaps the fresh outline into place — no reload.
        // When the cache write failed (a full localStorage) we send the outline in the message
        // itself, so a full disk costs caching but never the outline.
        broadcastOutlineUpdated(pageKey(), saved ? undefined : serializeEpochNode(root.value))
      }
      console.groupEnd()
      console.timeEnd('traverseTimeline')
    }
  }

  // Manual "Reindex" from the panel. In the worker this traverses directly; in the consumer tab
  // it drops the cache, shows a partial live-path outline, and asks the worker to re-traverse.
  const reindexTimeline = async () => {
    clearCachedOutline()
    isLoadedFromCache.value = false
    if (isOutlineWorker()) {
      await traverseTimeline({ save: true, force: true })
      return
    }
    rebuildFromLivePath()
    requestWorkerTraversal()
  }

  const initializeOutline = async () => {
    if (hasInitializedOutline.value) return
    // Wait until an epoch on the current page has mounted; otherwise there is nothing to build
    // from (e.g. mid-navigation when currentEpoch is still TOP_EPOCH). We check currentEpoch
    // directly rather than getLiveRoot, whose TOP_EPOCH.children[0] fallback could return a
    // stale root left over from a previously visited page.
    if (currentEpoch.value._name === '__TOP_EPOCH__') return

    const key = pageKey()
    hasInitializedOutline.value = true
    loadedPageKey.value = key

    // The worker exists only to produce a fresh outline, so it ignores any cache and always
    // traverses. This is what makes an HMR reload of the worker iframe pick up structural changes:
    // were it to honor a still-fresh cache here, an edit would leave the outline stale.
    if (isOutlineWorker()) {
      await traverseTimeline({ save: true })
      return
    }

    // A cached outline (e.g. from a previous traversal or a Reindex Timeline click) is always
    // honored, even when automatic traversal is off: autoTraverse only governs whether we *start*
    // a traversal on our own, not whether we use one that already ran.
    if (canUseLocalStorage()) {
      const cached = loadCachedOutline(key)
      if (cached) {
        const cachedRoot = hydrateEpochNode(cached.root)
        // Discard a cache that no longer matches the live experiment structure (epochs added,
        // removed, or renamed). This is what lets us keep a long TTL: outdated outlines are caught
        // structurally rather than by expiry. Fall through to rebuild below.
        if (livePathMatchesCache(cachedRoot, currentEpoch.value)) {
          root.value = cachedRoot
          isLoadedFromCache.value = true
          cacheSavedAt.value = cached.savedAt
          hasTraversed.value = true
          syncCachedOutlineForCurrentEpoch(root.value, currentEpoch.value)
          return
        }
        console.warn('Cached epoch outline does not match the live timeline structure; rebuilding.')
        clearCachedOutline(key)
      }
    }

    // Consumer tab, no usable cache. Show a partial outline from the live path immediately so the
    // panel isn't empty, then ask the worker to produce the full one (it broadcasts when ready).
    traversalError.value = loadStoredTraversalError(key)
    refreshTree()
    if (autoTraverse.value) requestWorkerTraversal()
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
    traversalError.value = null
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

  // Worker: re-traverse and re-broadcast when a consumer requests it (Reindex, missing/diverged
  // cache). traverseTimeline early-returns while already traversing, so overlapping requests are
  // harmless. Only handle requests for the route this worker is pinned to.
  const handleWorkerRequest = (key: string) => {
    if (key !== pageKey()) return
    console.debug('Outline worker: traversal requested for', key)
    void traverseTimeline({ save: true, force: true })
  }

  // The worker must refresh its outline when the experiment changes during development. We listen
  // for Vite's `vite:afterUpdate`, which fires on *every* hot update regardless of which module
  // changed — an `import.meta.hot.accept` here would only catch edits to this file, missing the
  // experiment-component edits that actually change the structure.
  //
  // We reload the worker document rather than re-traversing in place: in-place HMR leaves stale
  // epoch instances behind (TOP_EPOCH.children is never pruned on unmount), so re-traversing over
  // the polluted tree merges the old and new structures. A full reload of the (invisible, stateless)
  // worker gives a clean epoch tree; its fresh mount then traverses and broadcasts as usual.
  // Debounced because one edit fires several updates.
  const runAsWorker = () => {
    if (!import.meta.hot) return
    const reload = useDebounceFn(() => {
      console.debug('Outline worker: HMR update; reloading worker for a clean traversal')
      if (import.meta.client) window.location.reload()
    }, 300)
    import.meta.hot.on('vite:afterUpdate', reload)
  }

  // React both to epoch changes (tree updates within a page) and route changes (page switches).
  watch([currentEpoch, () => route.path], () => { void syncOutlineForCurrentPage() })

  if (import.meta.client) {
    useEventListener(window, 'storage', (event) => {
      if (event.key === outlineTraversalErrorKey(pageKey())) {
        syncTraversalErrorFromStorage(pageKey())
      }
    })
  }

  // We step through the full experiment to discover epochs (nodes)
  // NOTE: this will miss epochs that are not always created (e.g. because condition or randomness)
  onMounted(async () => {
    isMounted = true
    if (channel) {
      channel.onmessage = (event: MessageEvent<OutlineWorkerMessage>) => {
        const msg = event.data
        if (!msg) return
        if (isOutlineWorker()) {
          // Worker applies consumer requests; ignores its own update announcements.
          if (msg.type === 'request-traversal') handleWorkerRequest(msg.pageKey)
        } else {
          // Consumer applies worker-produced outlines in place, without reloading.
          if (msg.type === 'outline-updated') reloadOutlineFromCache(msg.pageKey, msg.root)
          if (msg.type === 'traversal-failed') applyWorkerTraversalError(msg.pageKey, msg.error)
        }
      }
    }
    if (isOutlineWorker()) runAsWorker()
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
    traversalError,
    markCachedOutlineStale,
    traverseTimeline,
    reindexTimeline,
    clearCachedOutline,
    autoTraverse,
  }
})
