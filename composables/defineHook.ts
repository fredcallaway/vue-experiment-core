type HookCallback<S> = (state: S) => void | Promise<void>

type Hook<S> = {
  emit: (state: S) => Promise<void>
  receive: (callback?: HookCallback<S>) => Promise<void>
  on: (callback: HookCallback<S>) => () => void // unsubscribe
  reset: () => void
}

export function defineHook<S>(): Hook<S> {
  const queue: Array<{ resolve: () => void; callback: HookCallback<S> }> = []
  const subscribers: Set<HookCallback<S>> = new Set()

  return {
    
    // called from the source component (the one where defineHook is called)
    // await the result if you want to allow consumers to pause execution
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

    // called from the consuming component
    // callback specifies what to do while the source is paused (assuming it awaits the emit call)
    // this function resolves AFTER the callback resolves
    receive(callback = () => {}) {
      return new Promise((resolve) => {
        queue.push({ resolve, callback })
      })
    },

    // basic event listening without async
    on(callback) {
      subscribers.add(callback)
      const unsubscribe = () => subscribers.delete(callback)
      tryOnScopeDispose(unsubscribe)
      return unsubscribe
    },

    // drop pending receive() waiters (their promises never resolve). Hooks are
    // usually module-level, so waiters outlive the component that registered them;
    // call this when (re)entering the consuming flow to clear stale ones left by
    // jumps or HMR.
    reset() {
      queue.length = 0
    },
  }
}
