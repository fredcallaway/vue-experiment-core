type Unsubscriber = () => void

export type EventController<TypeMap extends Record<string, any>> = {
  emit<E extends keyof TypeMap>(eventType: E, info: TypeMap[E]): void
  on<E extends keyof TypeMap>(eventType: E, handler: (info: TypeMap[E]) => void): Unsubscriber
  promise<E extends keyof TypeMap>(
    eventType: E,
    predicate?: (info: TypeMap[E]) => boolean
  ): Promise<TypeMap[E]>
}

export function createEventController<TypeMap extends Record<string, any>>(): EventController<TypeMap> {
  const listeners = new Map<keyof TypeMap, Set<(info: TypeMap[keyof TypeMap]) => void>>()

  const emit = <E extends keyof TypeMap>(eventType: E, info: TypeMap[E]) => {
    listeners.get(eventType)?.forEach((handler) => handler(info))
  }

  const on = <E extends keyof TypeMap>(eventType: E, handler: (info: TypeMap[E]) => void) => {
    const eventListeners = listeners.get(eventType) ?? new Set()
    eventListeners.add(handler as (info: TypeMap[keyof TypeMap]) => void)
    listeners.set(eventType, eventListeners)

    return () => {
      eventListeners.delete(handler as (info: TypeMap[keyof TypeMap]) => void)
      if (eventListeners.size === 0) {
        listeners.delete(eventType)
      }
    }
  }

  const promise = <E extends keyof TypeMap>(
    eventType: E,
    predicate: (info: TypeMap[E]) => boolean = () => true
  ) => {
    const { resolve, promise } = Promise.withResolvers<TypeMap[E]>()
    const unsubscribe = on(eventType, (info) => {
      if (!predicate(info)) return
      unsubscribe()
      resolve(info)
    })
    return promise
  }

  return {
    emit,
    on,
    promise,
  }
}
