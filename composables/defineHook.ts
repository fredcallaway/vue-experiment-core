type HookCallback<S> = (state: S) => void | Promise<void>

type Hook<S> = {
  emit: (state: S) => Promise<void>
  receive: (callback?: HookCallback<S>) => Promise<void>
}

export function defineHook<S>(): Hook<S> {
  const queue: Array<{ resolve: () => void; callback: HookCallback<S> }> = []

  return {
    async emit(state) {
      const waiter = queue.shift()
      if (waiter) {
        await waiter.callback(state)
        waiter.resolve()
      }
    },

    receive(callback = () => {}) {
      return new Promise((resolve) => {
        queue.push({ resolve, callback })
      })
    },
  }
}
