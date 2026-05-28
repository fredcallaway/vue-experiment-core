import { onUnmounted, getCurrentInstance } from "vue"

const makePromise = <T = any>() => {
  let resolve: (value: T | PromiseLike<T>) => void
  let reject: (reason?: any) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { resolve: resolve!, reject: reject!, promise }
}

const ensureErrorHandler = R.once(() => {
  const { pushHandler } = useErrorHandler()
  pushHandler((err, instance, info, next) => {
    if (String(err) === 'useLocalAsync:unmounted') {
      return
    }
    next()
  }, 1000)
})

export const useLocalAsync = () => {
  ensureErrorHandler()
  
  const instance = getCurrentInstance()
  if (!instance) {
    throw new Error('useLocalAsync must be used in a component')
  }

  const rejects = new Set<(reason?: any) => void>()
  onUnmounted(() => {
    if (rejects.size > 0) {
      console.debug(`useLocalAsync: unmounted with ${rejects.size} pending promises`)
    }
    rejects.forEach(reject => reject('useLocalAsync:unmounted'))
  })

  const track = <T>(p: Promise<T>): Promise<T> => {
    const { resolve, reject, promise } = makePromise<T>()
    rejects.add(reject)
    p.then(
      value => {
        rejects.delete(reject)
        resolve(value)
      },
      reason => {
        rejects.delete(reject)
        reject(reason)
      },
    )
    return promise
  }

  // accepts an async function or a promise
  function registerAsync<A extends any[], T>(fn: (...args: A) => Promise<T>): (...args: A) => Promise<T>
  function registerAsync<T>(promise: Promise<T>): Promise<T>
  function registerAsync(arg: any): any {
    if (typeof arg === 'function') {
      return ((...args: any[]) => track(arg(...args)))
    }
    return track(arg)
  }

  const sleep = registerAsync(async (ms: number) => {
    ms = replaceFast(ms, Math.max(200, ms / 5))
    await new Promise(resolve => setTimeout(resolve, ms))
  })

  return {
    registerAsync,
    sleep,
  }
}
