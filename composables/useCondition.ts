import { useCurrentSession } from './useCurrentSession'

export const useConditions = createGlobalState(() => {
  const meta = useCurrentSession()
  const conditions = reactive<Record<string, any>>({})
  const options = reactive<Record<string, readonly any[]>>({})
  const isPinned = reactive<Record<string, boolean>>({})
  meta.conditions = conditions

  let state = meta.assignment

  const getPinnedCondition = (key: string) => {
    const format = (v: unknown) => typeof v === 'string' ? v : JSON.stringify(v)
    return useUrlParam(`condition.${key}`, {
      parse: (value) => {
        return options[key]?.find(candidate => format(candidate) === value)
      },
      format,
    })
  }

  const chooseOne = <T>(key: string, values: readonly T[]): T => {
    options[key] = values
    
    const pinned = getPinnedCondition(key)
    if (pinned.value !== undefined) {
      // use pinned value if it exists 
      // we don't update index state so that assignment cycles over un-pinned conditions only
      conditions[key] = pinned.value
    } else {
      // extract index from the state
      const index = state % values.length
      state = Math.floor(state / values.length)
      conditions[key] = values[index]!
    }

    // keep pinned value in sync with conditions and isPinned
    isPinned[key] = pinned.value !== undefined
    watchEffect(() => {
      if (isPinned[key]) {
        pinned.value = conditions[key]
      } else {
        pinned.value = undefined
      }
    })

    return conditions[key]
  }

  const choice = <T extends Record<string, readonly any[]>>(choicesObj: T): { [K in keyof T]: T[K][number] } => {
    const result: Record<string, any> = {}
    for (const [key, choices] of Object.entries(choicesObj)) {
      result[key] = chooseOne(key, choices)
    }
    return conditions as { [K in keyof T]: T[K] extends any[] ? T[K][number] : T[K] }
  }

  const permute = <T>(key: string, values: T[]): T[] => {
    const allPerms = permutations(values.length)
    if (values.length > 4) {
      console.warn(`useConditions.permute(${key}, ...) yields ${allPerms.length} permutations`)
    }
    const permutedValues = allPerms.map(perm => perm.map(i => values[i]!))
    return chooseOne(key, permutedValues)
  }

  return { conditions, options, isPinned, choice, permute }
})
