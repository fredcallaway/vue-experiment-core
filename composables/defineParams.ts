export function defineParams<T extends Record<string, any>>(defaults: T) {
  const injectionKey = Symbol()

  const provideParams = (params: Partial<T>) => {
    const existingRef = injectLocal<Ref<Partial<T>> | undefined>(injectionKey, undefined)
    if (existingRef) {
      Object.assign(existingRef.value, params)
    } else {
      const newRef = ref({ ...params } as Partial<T>)
      provideLocal(injectionKey, newRef)
    }
  }

  const useParams = (override?: Partial<T>): T => {
    const providedRef = injectLocal<Ref<Partial<T>> | undefined>(injectionKey)
    const provided = providedRef?.value
    return { ...defaults, ...provided, ...override } as T
  }

  return [provideParams, useParams] as const
}

