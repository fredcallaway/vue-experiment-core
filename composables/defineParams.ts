type MaybeGetter<T> = T | (() => T)
type MaybeGetterObject<T> = { [K in keyof T]: MaybeGetter<T[K]> }
export type ParamsSpec<T> = Partial<MaybeGetterObject<T>>

function evaluateGetters<T extends Record<string, any>>(obj: MaybeGetterObject<T>): T {
  return R.mapValues(obj, (value) => R.isFunction(value) ? value() : value) as T
}

export function defineParams<T extends Record<string, any>>(defaults: MaybeGetterObject<T>) {
  const injectionKey = Symbol()

  const provideParams = (params: ParamsSpec<T>) => {
    const existingRef = injectLocal<Ref<ParamsSpec<T>> | undefined>(injectionKey, undefined)
    const newRef = ref({ ...existingRef?.value, ...params } as ParamsSpec<T>)
    provideLocal(injectionKey, newRef)
  }

  const useParams = (override?: ParamsSpec<T>): T => {
    const providedRef = injectLocal<Ref<ParamsSpec<T>> | undefined>(injectionKey, undefined)
    const provided = stripUndefined(providedRef?.value ?? {})
    const overridden = stripUndefined(override ?? {})
    const merged = { ...defaults, ...provided, ...overridden } as MaybeGetterObject<T>
    const params = evaluateGetters(merged)
    return params as T
  }

  const ProvideParamsComponent = defineComponent<{ params?: ParamsSpec<T> }>({
    props: {
      params: {
        type: Object as PropType<ParamsSpec<T>>,
        default: () => ({} as ParamsSpec<T>),
      },
    },
    setup(props, { slots }) {
      provideParams(props.params || {})
      return () => slots.default?.()
    },
  })

  return [provideParams, useParams, ProvideParamsComponent] as const
}

