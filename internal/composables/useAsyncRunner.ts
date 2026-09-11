export const useAsyncRunner = (getErrorMessage?: (error: unknown) => string | null) => {
  const loading = ref(false)
  const error = ref<any>(null)

  const execute = async <T, Args extends any[]>(
    fn: (...args: Args) => Promise<T>, args: Args, rethrow: boolean,
  ): Promise<T | null> => {
    loading.value = true
    error.value = null
    try {
      return await fn(...args)
    } catch (e: any) {
      console.error('useAsyncRunner error', e)
      const message = getErrorMessage?.(e)
      if (!message) error.value = e
      // ActionButton owns the toast for wrapped actions and must receive a rejection.
      if (rethrow) throw message ? new Error(message, { cause: e }) : e
      if (message) toast.error(message)
      return null
    } finally {
      loading.value = false
    }
  }

  const run = <T, Args extends any[]>(fn: (...args: Args) => Promise<T>, ...args: Args) => execute(fn, args, false)

  const wrap = <Args extends any[]>(fn: (...args: Args) => Promise<any>) => {
    return (...args: Args) => execute(fn, args, true)
  }

  return {
    loading,
    error,
    run,
    wrap,
  }
}
