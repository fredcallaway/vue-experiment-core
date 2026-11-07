export type ConditionOptions = Record<string, readonly unknown[]>

export type AssignedConditions<Options extends ConditionOptions> = {
  [Key in keyof Options]: Options[Key][number]
}

type Pair = { left: number; right: number; width: number; counts: number[] }

const schedules = new Map<string, number[][]>()

export function getConditionAssignmentCount(options: ConditionOptions): number {
  let count = 1
  for (const [key, values] of Object.entries(options)) {
    if (!Array.isArray(values) || values.length === 0) {
      throw new Error(`Condition "${key}" must have a non-empty array of values`)
    }
    count *= values.length
    if (!Number.isSafeInteger(count)) throw new Error('Condition combination count exceeds a safe integer')
  }
  return count
}

function scoreIsLower(candidate: number[], current: number[]): boolean {
  for (let index = 0; index < candidate.length; index++) {
    if (candidate[index] !== current[index]) return candidate[index]! < current[index]!
  }
  return false
}

function buildSchedule(levels: number[]): number[][] {
  const combinations = levels.reduce<number[][]>((rows, length) => rows.flatMap(row =>
    Array.from({ length }, (_, index) => [...row, index]),
  ), [[]])
  const remaining = new Map(combinations.map(row => [row.join(','), row]))
  const pairs: Pair[] = []
  for (let left = 0; left < levels.length; left++) {
    for (let right = left + 1; right < levels.length; right++) {
      const width = levels[right]!
      pairs.push({ left, right, width, counts: Array(levels[left]! * width).fill(0) })
    }
  }
  const sequence: number[][] = []

  while (remaining.size > 0) {
    const pairStats = pairs.map(pair => {
      let minimum = Infinity
      let maximum = 0
      let minima = 0
      for (const count of pair.counts) {
        maximum = Math.max(maximum, count)
        if (count < minimum) {
          minimum = count
          minima = 1
        } else if (count === minimum) {
          minima++
        }
      }
      return { ...pair, minimum, maximum, minima }
    })

    let start: number[] | undefined
    let bestScore = [Infinity, Infinity]
    for (const candidate of remaining.values()) {
      let spread = 0
      let repeats = 0
      for (const pair of pairStats) {
        const count = pair.counts[candidate[pair.left]! * pair.width + candidate[pair.right]!]!
        const minimum = pair.minimum + Number(count === pair.minimum && pair.minima === 1)
        spread = Math.max(spread, Math.max(pair.maximum, count + 1) - minimum)
        repeats += count
      }
      const score = [spread, repeats]
      if (scoreIsLower(score, bestScore)) {
        start = candidate
        bestScore = score
      }
    }
    if (!start) throw new Error('No unused condition combination')

    // Advancing every factor together partitions the grid into disjoint cycles.
    // Each cycle balances every marginal, including every prefix within the cycle.
    // Pairwise scoring selects a cycle's starting point; it cannot break that guarantee.
    let row = start
    do {
      remaining.delete(row.join(','))
      sequence.push(row)
      for (const pair of pairs) pair.counts[row[pair.left]! * pair.width + row[pair.right]!]!++
      row = row.map((value, index) => (value + 1) % levels[index]!)
    } while (row.some((value, index) => value !== start[index]))
  }
  return sequence
}

export function getConditionsForAssignment<Options extends ConditionOptions>(
  assignment: number,
  options: Options,
): AssignedConditions<Options> {
  if (!Number.isSafeInteger(assignment) || assignment < 0) {
    throw new Error(`Assignment must be a non-negative safe integer, got ${assignment}`)
  }
  const count = getConditionAssignmentCount(options)
  const entries = Object.entries(options)
  const levels = entries.map(([, values]) => values.length)
  const key = levels.join(',')
  let sequence = schedules.get(key)
  if (!sequence) {
    sequence = buildSchedule(levels)
    schedules.set(key, sequence)
  }
  const indices = sequence[assignment % count]!
  const assigned = entries.map(([name, values], index) => [name, values[indices[index]!]!])
  return Object.fromEntries(assigned) as AssignedConditions<Options>
}
