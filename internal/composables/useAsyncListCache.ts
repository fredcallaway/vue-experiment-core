/**
 * Generic cache for managing lists where:
 * - Items can be fetched incrementally via async generator
 * - Individual items can be fetched separately
 * - List and individual fetches stay synchronized
 * - SWR behavior (always return cached data immediately, refresh in background)
 */

export interface AsyncListCache<TShort extends object, TFull extends TShort> {
  // List interface
  getListCache: () => {
    items: Ref<(TShort)[]>  // Reactive sorted list
    timestamp: Ref<number | null>  // Last refresh time
    isLoading: Ref<boolean>  // Currently fetching
    refresh: () => Promise<void>  // Force refresh (ignores minRefreshInterval)
    error: Ref<unknown> | null  // Error from last refresh
  }
  getListAsync: () => Promise<TShort[]>

  // Individual item interface
  getItemCache: (id: string) => {
    item: Ref<TFull | TShort | null>          // Reactive item 
    fullItem: Ref<TFull | null>          // Reactive full item 
    timestamp: Ref<number | null>    // Last refresh time
    isLoading: Ref<boolean>       // Currently fetching
    refresh: () => Promise<void>     // Force refresh (ignores minRefreshInterval)
    error: Ref<unknown> | null  // Error from last refresh
  }
  getItemAsync: (id: string) => Promise<TFull>

  // Cache manipulation
  updateItem: (item: TFull, timestamp?: number) => void  // Manually update cache
  deleteItem: (id: string) => void            // Remove from cache
  clear: () => void                           // Clear entire cache
}

export interface AsyncListCacheOptions<TShort, TFull> {
  /** Storage key for localStorage persistence */
  storageKey: string

  /** Async generator that yields batches of items */
  fetchList: () => AsyncGenerator<TShort[], void, unknown>

  /** Fetch individual item by ID */
  fetchItem: (id: string) => Promise<TFull>

  /** Extract unique ID from item */
  getItemId: (item: TShort | TFull) => string

  /** Minimum interval between automatic refreshes (milliseconds) */
  minRefreshInterval: number
}

type CachedItem<TShort extends object, TFull extends TShort> = {
  data: TFull
  timestamp: number
  isFull: true
} | {
  data: TShort
  timestamp: number
  isFull: false
}


export function useAsyncListCache<TShort extends object, TFull extends TShort>(
  options: AsyncListCacheOptions<TShort, TFull>
): AsyncListCache<TShort, TFull> {
  const {
    fetchList,
    fetchItem,
    getItemId,
    minRefreshInterval,
    storageKey,
  } = options

  // Internal cache storage - use reactive ref with localStorage persistence
  type Cache = Partial<Record<string, CachedItem<TShort, TFull>>>
  const cache = useLocalStorage<Cache>(
    `asyncListCache:${storageKey}`,
    {},
    { mergeDefaults: true }
  )
  console.debug('[asyncListCache] cache loaded from localStorage', cache.value)

  // List state
  const listTimestamp = useLocalStorage<number | null>(
    `asyncListCache:${storageKey}:timestamp`,
    null,
  )
  const isLoadingList = ref(false)
  const listError = ref<unknown>(null)

  // List refresh - always refreshes (ignores minRefreshInterval)
  const refreshList = async () => {
    // Don't start a new refresh if already refreshing
    if (isLoadingList.value) {
      console.debug('[asyncListCache] Already refreshing list')
      // don't return until refresh is done
      await until(isLoadingList).toBe(false)
      return
    }

    isLoadingList.value = true
    listError.value = null

    try {
      const now = Date.now()
      for await (const batch of fetchList()) {
        // Process each item in the batch
        for (const item of batch) {
          const id = getItemId(item)
          const existing = cache.value[id]

          if (existing && existing.isFull) {
            // Merge: preserve TFull fields if existing is fuller
            cache.value[id] = {
              ...existing,
              data: { ...existing.data, ...item },
            }
          } else {
            // Override or add new item
            cache.value[id] = {
              data: item,
              timestamp: Date.now(),
              isFull: false,
            } as CachedItem<TShort, TFull>
          }
        }
      }

      listTimestamp.value = now
    } catch (error) {
      listError.value = error
      throw error
    } finally {
      isLoadingList.value = false
    }
  }

  // Get list interface (with auto-refresh respecting minRefreshInterval)
  const _getListCache = useMemoize(() => {
    return {
      items: computed(() => {
        return Object.values(cache.value).map(c => c!.data)
      }),
      timestamp: listTimestamp,
      isLoading: isLoadingList,
      refresh: refreshList,
      error: listError,
    }
  })

  const getListCache = () => {
    const now = Date.now()
    const shouldAutoRefresh =
      Object.keys(cache.value).length === 0 ||
      !listTimestamp.value ||
      (now - (listTimestamp.value ?? 0) >= minRefreshInterval)

    // Auto-refresh if cache is empty, has no timestamp, or interval has passed
    if (shouldAutoRefresh && !isLoadingList.value) {
      refreshList()
    }
    return _getListCache()
  }

  const getListAsync = async () => {
    const listCache = getListCache()
    listCache.refresh()
    await until(listCache.isLoading).toBe(false)
    return listCache.items.value
  }

  // get item interface
  const _getItemCache = useMemoize((id: string) => {
    
    const item = computed(() => {
      return cache.value[id]?.data ?? null
    })
    const fullItem = computed(() => {
      if (!cache.value[id]?.isFull) return null
      return cache.value[id]?.data
    })
    const timestamp = computed(() => {
      return cache.value[id]?.timestamp ?? null
    })
    const isLoading = ref(false)
    const error = ref<unknown>(null)

    const refresh = async () => {
      // Don't start a new refresh if already refreshing
      if (isLoading.value) {
        console.debug(`[asyncListCache] Already refreshing item ${id}`)
        await until(isLoading).toBe(false)
        return
      }
      
      isLoading.value = true
      error.value = null
      try {
        const now = Date.now()
        const fullItemData = await fetchItem(id)

        cache.value[id] = {
          data: fullItemData,
          timestamp: now,
          isFull: true,
        }

      } catch (err) {
        error.value = err
        throw err
      } finally {
        isLoading.value = false
      }
    }

    return {
      item,
      fullItem,
      timestamp,
      isLoading,
      refresh,
      error,
    }
  })

  // Get individual item interface
  const getItemCache = (id: string) => {

    const itemCache = _getItemCache(id)
    
    const shouldAutoRefresh = 
      !cache.value[id] || 
      !cache.value[id].isFull ||
      Date.now() - (cache.value[id].timestamp ?? 0) >= minRefreshInterval

    if (shouldAutoRefresh) {
      itemCache.refresh().catch(e => {
        console.error(`Problem refreshing item ${id}: ${e}`)
      })
    }

    return itemCache
  }

  const getItemAsync = async (id: string) => {
    const itemCache = _getItemCache(id)
    await itemCache.refresh()
    return assertDefined(itemCache.fullItem.value, `Problem refreshing item ${id}`)
  }

  // Manual cache manipulation
  const updateItem = (item: TFull, timestamp?: number) => {
    const id = getItemId(item)
    const existing = cache.value[id]
    if (existing && existing.isFull) {
      const missingKeys = Object.keys(existing.data).filter(key => !Object.keys(item).includes(key))
      if (missingKeys.length > 0) {
        throw new Error(`updateItem: provided item is missing the following fields: ${missingKeys.join(', ')}`)
      }
    }

    cache.value[id] = {
      data: item as any,
      timestamp: timestamp ?? (existing?.timestamp ?? Date.now()),
      isFull: true,
    } as CachedItem<TShort, TFull>
  }

  const deleteItem = (id: string) => {
    delete cache.value[id]
    _getItemCache.delete(id)
  }

  const clear = () => {
    cache.value = {}
    listTimestamp.value = null
    listError.value = null
    _getItemCache.clear()
  }

  return {
    getListCache,
    getListAsync,
    getItemCache,
    getItemAsync,
    updateItem,
    deleteItem,
    clear
  }
}
