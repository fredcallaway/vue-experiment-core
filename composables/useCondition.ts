import { useUrlParam } from '../utils/url-params'
import { createGlobalState } from '@vueuse/core'

import { useCurrentSession } from './useCurrentSession'
import {
  getConditionsForAssignment,
  getConditionAssignmentCount,
  type AssignedConditions,
  type ConditionOptions,
} from '../utils/conditions'

export const useConditions = createGlobalState(() => {
  const meta = useCurrentSession()
  const conditions = reactive<Record<string, any>>({})
  const options = reactive<Record<string, readonly any[]>>({})
  const isPinned = reactive<Record<string, boolean>>({})
  meta.conditions = conditions

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
    if (isPinned[key]) conditions[key] = pinned.value
    watchEffect(() => {
      if (isPinned[key]) {
        pinned.value = conditions[key]
      } else {
        pinned.value = undefined
      }
    })
    return pinned
  }

  const assign = <Options extends ConditionOptions>(choices: Options): AssignedConditions<Options> => {
    getConditionAssignmentCount(choices)
    for (const key of Object.keys(options)) {
      if (!(key in choices)) {
        delete conditions[key]
        delete options[key]
        delete isPinned[key]
      }
    }
    const active: ConditionOptions = {}
    for (const [key, values] of Object.entries(choices)) {
      const pinned = registerCondition(key, values)
      if (pinned.value === undefined) active[key] = values
    }
    Object.assign(conditions, getConditionsForAssignment(meta.assignment, active))
    return conditions as AssignedConditions<Options>
  }

  return { conditions, options, isPinned, assign }
})
