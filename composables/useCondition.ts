import { useCurrentSession } from './useCurrentSession'

/*
 
Manages the assignment of conditions to participants.
Every time `choice` is called, a value is chosen based on the 'condition' URL param.
The value is returned and added to `conditions` for later reference.
Values are "sampled" to tile the space as uniformly as possible.
 
*/
export const useConditions = createGlobalState(() => {
  const meta = useCurrentSession()
  if (!meta.assignment) {
    meta.assignment = random.int(10_000)
  }
  const conditions = reactive<Record<string, any>>({})
  meta.conditions = conditions

  let state = meta.assignment

  const chooseOne = <T>(key: string, values: readonly T[]): T => {
    const result = values[state % values.length]
    state = Math.floor(state / values.length)
    conditions[key] = result
    return result
  }

  const choice = <T extends Record<string, readonly any[]>>(choicesObj: T): { [K in keyof T]: T[K][number] } => {
    const result: Record<string, any> = {}
    for (const [key, choices] of Object.entries(choicesObj)) {
      result[key] = chooseOne(key, choices)
    }
    return result as { [K in keyof T]: T[K] extends any[] ? T[K][number] : T[K] }
  }

  const permute = <T>(key: string, values: T[]): T[] => {
    const allPerms = permutations(values.length)
    if (values.length > 4) {
      console.warn(`useConditions.permute(${key}, ...) yields ${allPerms.length} permutations`)
    }
    return chooseOne(key, allPerms).map(i => values[i]!)
  }

  return { conditions, choice, permute }
})
