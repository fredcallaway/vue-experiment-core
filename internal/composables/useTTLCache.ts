interface CachedData<T> {
  data: T
  timestamp: number
}

export interface TTLCache<T> {
  data: Ref<T | null>
  timestamp: Ref<number | null>
  isLoading: Ref<boolean>
  isReady: Ref<boolean>
  error: Ref<unknown>
  get: () => Promise<T>
  refresh: () => Promise<T>
  clear: () => void
  patch: (updater: (data: T) => T) => void
}

export interface TTLCacheOptions<T> {
  storageKey?: string
  onError?: (error: unknown) => void
  onSuccess?: (data: T | null) => void
}

export function useTTLCache<T>(ttlSeconds: number, fetcher: () => Promise<T>, options?: TTLCacheOptions<T>){
  const ttl = ttlSeconds * 1000
  const storageKey = options?.storageKey
  const storage = storageKey && ttlSeconds > 3600 ? localStorage : sessionStorage

  let getPromise: Promise<T> | null = null

  let cache: CachedData<T> | null = storageKey ? JSON.parse(storage.getItem(storageKey) || 'null') : null

  const timestamp = ref<number | null>(cache?.timestamp ?? null)

  const getData = async (): Promise<T> => {
    if (getPromise) {
      return getPromise
    }

    if (cache !== null && (Date.now() - cache.timestamp < ttl)) {
      return cache.data
    } else {
      getPromise = fetcher()
      const data = await getPromise
      cache = {
        data,
        timestamp: Date.now()
      }
      if (storageKey) {
        storage.setItem(storageKey, JSON.stringify(cache))
      }
      timestamp.value = cache.timestamp
      getPromise = null
      return data
    }
  }
  
  const { state: data, executeImmediate, isLoading, isReady, error } = useAsyncState<T | null>(
    getData,
    null,
    {
      immediate: true,
      resetOnExecute: false,
      throwError: true,
      onError: options?.onError,
      onSuccess: options?.onSuccess,
    }
  )

  const clear = (): void => {
    cache = null
    getPromise = null
    if (storageKey) {
      storage.removeItem(storageKey)
    }
  }

  const get = async (): Promise<T> => {
    const result = await executeImmediate()
    if (result instanceof Error || result === null) {
      throw result
    }
    return result
  }

  const refresh = () => {
    clear() // note: doesn't reset data
    return get()
  }

  const patch = (updater: (data: T) => T): void => {
    if (cache === null) {
      throw new Error('Cannot patch null cache')
    }
    const updatedData = updater(cache.data)
    cache = {
      data: updatedData,
      timestamp: cache.timestamp
    }
    if (storageKey) {
      storage.setItem(storageKey, JSON.stringify(cache))
    }
    data.value = updatedData
  }

  return {
    data,
    timestamp,
    isLoading,
    isReady,
    error,
    get,
    refresh,
    clear,
    patch,
  }
}

