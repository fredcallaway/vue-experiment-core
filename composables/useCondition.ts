import { useCurrentSession } from './useCurrentSession'
import {
  getConditionsForAssignment,
  type AssignedConditions,
  type ConditionDesign,
  type ConditionOptions,
} from '../utils/conditions'

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

  const registerCondition = <T>(key: string, values: readonly T[]) => {
    options[key] = values
    const pinned = getPinnedCondition(key)
    isPinned[key] = pinned.value !== undefined
    watchEffect(() => {
      if (isPinned[key]) {
        pinned.value = conditions[key]
      } else {
        pinned.value = undefined
      }
    })
    return pinned
  }

  const chooseOne = <T>(key: string, values: readonly T[]): T => {
    const pinned = registerCondition(key, values)
    if (pinned.value !== undefined) {
      // We do not update state, so assignment cycles over unpinned conditions only.
      conditions[key] = pinned.value
    } else {
      const index = state % values.length
      state = Math.floor(state / values.length)
      conditions[key] = values[index]!
    }

    return conditions[key]
  }

  const choice = <T extends Record<string, readonly any[]>>(choicesObj: T): { [K in keyof T]: T[K][number] } => {
    for (const [key, choices] of Object.entries(choicesObj)) {
      chooseOne(key, choices)
    }
    return conditions as { [K in keyof T]: T[K] extends any[] ? T[K][number] : T[K] }
  }

  const assign = <Main extends ConditionOptions, Counterbalance extends ConditionOptions>(
    design: ConditionDesign<Main, Counterbalance>,
  ): AssignedConditions<Main> & AssignedConditions<Counterbalance> => {
    const counterbalance = design.counterbalance ?? {} as Counterbalance
    const duplicate = Object.keys(design.main).find(key => key in counterbalance)
    if (duplicate) throw new Error(`Condition "${duplicate}" is both main and counterbalance`)

    const activeMain: ConditionOptions = {}
    const activeCounterbalance: ConditionOptions = {}
    const register = (choices: ConditionOptions, activeChoices: ConditionOptions) => {
      for (const [key, values] of Object.entries(choices)) {
        const pinned = registerCondition(key, values)
        if (pinned.value === undefined) {
          activeChoices[key] = values
        } else {
          conditions[key] = pinned.value
        }
      }
    }

    register(design.main, activeMain)
    register(counterbalance, activeCounterbalance)
    Object.assign(conditions, getConditionsForAssignment(meta.assignment, {
      main: activeMain,
      counterbalance: activeCounterbalance,
    }))

    return conditions as AssignedConditions<Main> & AssignedConditions<Counterbalance>
  }

  const permute = <T>(key: string, values: T[]): T[] => {
    const allPerms = permutations(values.length)
    if (values.length > 4) {
      console.warn(`useConditions.permute(${key}, ...) yields ${allPerms.length} permutations`)
    }
    const permutedValues = allPerms.map(perm => perm.map(i => values[i]!))
    return chooseOne(key, permutedValues)
  }

  return { conditions, options, isPinned, choice, assign, permute }
})
