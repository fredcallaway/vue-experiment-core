type HookCallback<S> = (state: S) => void | Promise<void>

type Hook<S> = {
  emit: (state: S) => Promise<void>
  receive: (callback?: HookCallback<S>) => Promise<void>
  on: (callback: HookCallback<S>) => () => void // unsubscribe
}

export function defineHook<S>(): Hook<S> {
  const queue: Array<{ resolve: () => void; callback: HookCallback<S> }> = []
  const subscribers: Set<HookCallback<S>> = new Set()

  return {
    async emit(state) {
      const waiter = queue.shift()
      if (waiter) {
        await waiter.callback(state)
        waiter.resolve()
      }
      for (const callback of subscribers) {
        await callback(state)
      }
    },

    receive(callback = () => {}) {
      return new Promise((resolve) => {
        queue.push({ resolve, callback })
      })
    },

    on(callback) {
      subscribers.add(callback)
      return () => {
        subscribers.delete(callback)
      }
    },
  }
}
