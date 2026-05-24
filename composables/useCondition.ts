import { useCurrentSession } from './useCurrentSession'

/*
 
Manages the assignment of conditions to participants.
Every time `choice` is called, a value is chosen based on the 'condition' URL param.
The value is returned and added to `conditions` for later reference.
Values are "sampled" to tile the space as uniformly as possible.
 
*/
export const useConditions = createGlobalState(() => {
  const meta = useCurrentSession()
  const conditions = reactive<Record<string, any>>({})
  const options = reactive<Record<string, readonly any[]>>({})
  const selectedIndices = reactive<Record<string, number>>({})
  meta.conditions = conditions

  let state = meta.assignment

  const chooseOne = <T>(key: string, values: readonly T[]): T => {
    const index = state % values.length
    const result = values[index]
    state = Math.floor(state / values.length)
    options[key] = values
    selectedIndices[key] = index
    conditions[key] = result
    return result
  }

  const setConditionIndex = (key: string, index: number) => {
    const values = options[key]
    if (values === undefined) {
      throw new Error(`Condition "${key}" has no registered options`)
    }
    if (!Number.isInteger(index) || index < 0 || index >= values.length) {
      throw new Error(`Condition "${key}" option index ${index} is out of bounds`)
    }
    selectedIndices[key] = index
    conditions[key] = values[index]
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
    const permutedValues = allPerms.map(perm => perm.map(i => values[i]!))
    return chooseOne(key, permutedValues)
  }

  return { conditions, options, selectedIndices, setConditionIndex, choice, permute }
})
