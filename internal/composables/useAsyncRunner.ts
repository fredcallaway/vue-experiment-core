export const useAsyncRunner = () => {
  const loading = ref(false)
  const error = ref<any>(null)

  const run = async <T, Args extends any[]>(fn: (...args: Args) => Promise<T>, ...args: Args): Promise<T | null> => {
    loading.value = true
    error.value = null
    try {
      return await fn(...args)
    } catch (e: any) {
      error.value = e
      console.error('useAsyncRunner error', e)
      return null
    } finally {
      loading.value = false
    }
  }

  const wrap = <Args extends any[]>(fn: (...args: Args) => Promise<any>) => {
    return (...args: Args) => run(fn, ...args)
  }

  return {
    loading,
    error,
    run,
    wrap,
  }
}