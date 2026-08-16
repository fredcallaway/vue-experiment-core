export type ConditionOptions = Record<string, readonly unknown[]>

export type ConditionDesign<
  Main extends ConditionOptions = ConditionOptions,
  Counterbalance extends ConditionOptions = ConditionOptions,
> = {
  main: Main
  counterbalance?: Counterbalance
}

export type AssignedConditions<Options extends ConditionOptions> = {
  [Key in keyof Options]: Options[Key][number]
}

type Combination = {
  indices: number[]
  values: Record<string, unknown>
}

const validateOptions = (label: string, options: ConditionOptions) => {
  for (const [key, values] of Object.entries(options)) {
    if (values.length === 0) throw new Error(`${label} condition "${key}" has no values`)
  }
}

const validateDesign = (design: ConditionDesign) => {
  const counterbalance = design.counterbalance ?? {}
  validateOptions('Main', design.main)
  validateOptions('Counterbalance', counterbalance)

  const duplicate = Object.keys(design.main).find(key => key in counterbalance)
  if (duplicate) throw new Error(`Condition "${duplicate}" is both main and counterbalance`)
}

const getCombinationCount = (options: ConditionOptions) => {
  return Object.values(options).reduce((count, values) => count * values.length, 1)
}

const getCombinations = (options: ConditionOptions): Combination[] => {
  const entries = Object.entries(options)
  return entries.reduce<Combination[]>((combinations, [key, values]) => {
    return combinations.flatMap(combination => values.map((value, index) => ({
      indices: [...combination.indices, index],
      values: { ...combination.values, [key]: value },
    })))
  }, [{ indices: [], values: {} }])
}

const getMarginalScore = (counts: number[][], candidate: Combination) => {
  let worstSpread = 0
  let totalVariance = 0

  for (const [conditionIndex, conditionCounts] of counts.entries()) {
    const nextCounts = conditionCounts.map((count, valueIndex) => {
      return count + Number(valueIndex === candidate.indices[conditionIndex])
    })
    const expected = nextCounts.reduce((sum, count) => sum + count, 0) / nextCounts.length
    const spread = Math.max(...nextCounts) - Math.min(...nextCounts)
    const variance = nextCounts.reduce((sum, count) => sum + (count - expected) ** 2, 0) / nextCounts.length
    worstSpread = Math.max(worstSpread, spread)
    totalVariance += variance
  }

  return [worstSpread, totalVariance] as const
}

const scoreIsLower = (candidate: readonly number[], current: readonly number[]) => {
  for (const [index, value] of candidate.entries()) {
    if (value !== current[index]) return value < current[index]!
  }
  return false
}

const getBalancedCounterbalanceSequence = (options: ConditionOptions) => {
  const combinations = getCombinations(options)
  const counts = Object.values(options).map(values => values.map(() => 0))
  const remaining = [...combinations]
  const sequence: Combination[] = []

  while (remaining.length > 0) {
    let bestIndex = 0
    let bestScore = getMarginalScore(counts, remaining[0]!)

    for (let index = 1; index < remaining.length; index++) {
      const score = getMarginalScore(counts, remaining[index]!)
      if (scoreIsLower(score, bestScore)) {
        bestIndex = index
        bestScore = score
      }
    }

    const [selected] = remaining.splice(bestIndex, 1)
    selected!.indices.forEach((valueIndex, conditionIndex) => {
      const conditionCounts = counts[conditionIndex]!
      conditionCounts[valueIndex] = conditionCounts[valueIndex]! + 1
    })
    sequence.push(selected!)
  }

  return sequence
}

export function getConditionAssignmentCount(design: ConditionDesign): number {
  validateDesign(design)
  return getCombinationCount(design.main) * getCombinationCount(design.counterbalance ?? {})
}

export function getConditionsForAssignment<
  Main extends ConditionOptions,
  Counterbalance extends ConditionOptions = Record<string, never>,
>(
  assignment: number,
  design: ConditionDesign<Main, Counterbalance>,
): AssignedConditions<Main> & AssignedConditions<Counterbalance> {
  if (!Number.isSafeInteger(assignment) || assignment < 0) {
    throw new Error(`Assignment must be a non-negative safe integer, got ${assignment}`)
  }
  validateDesign(design)

  const assigned: Record<string, unknown> = {}
  let mainState = assignment
  for (const [key, values] of Object.entries(design.main)) {
    assigned[key] = values[mainState % values.length]
    mainState = Math.floor(mainState / values.length)
  }

  const mainCount = getCombinationCount(design.main)
  const counterbalanceSequence = getBalancedCounterbalanceSequence(design.counterbalance ?? {})
  const counterbalanceBlock = Math.floor(assignment / mainCount)
  const counterbalance = counterbalanceSequence[counterbalanceBlock % counterbalanceSequence.length]!

  return { ...assigned, ...counterbalance.values } as AssignedConditions<Main> & AssignedConditions<Counterbalance>
}
