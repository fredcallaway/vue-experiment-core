
type PromiseWithResolvers<T> = {
  promise: Promise<T>
  resolve: (value: T | PromiseLike<T>) => void
  reject: (reason?: any) => void
}

if (typeof Promise.withResolvers !== "function") {
  Object.defineProperty(Promise, "withResolvers", {
    value: function <T = any>(): PromiseWithResolvers<T> {
      let resolve!: (value: T | PromiseLike<T>) => void
      let reject!: (reason?: any) => void

      const promise = new Promise<T>((res, rej) => {
        resolve = res
        reject = rej
      })

      return { promise, resolve, reject }
    },
    configurable: true,
    writable: true,
  })
}