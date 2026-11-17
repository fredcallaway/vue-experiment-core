import { describe, expect, test } from 'bun:test'
import { getConditionAssignmentCount, getConditionsForAssignment } from './conditions'

const optionsFor = levels => Object.fromEntries(levels.map((length, index) => [
  `factor${index}`, Array.from({ length }, (_, value) => value),
]))
const sequenceFor = options => Array.from({ length: getConditionAssignmentCount(options) }, (_, assignment) =>
  getConditionsForAssignment(assignment, options),
)

function checkMarginals(rows, options) {
  const counts = Object.fromEntries(Object.entries(options).map(([key, values]) => [key, values.map(() => 0)]))
  for (const row of rows) {
    for (const [key, values] of Object.entries(options)) {
      counts[key][values.indexOf(row[key])]++
      expect(Math.max(...counts[key]) - Math.min(...counts[key])).toBeLessThanOrEqual(1)
    }
  }
}

function pairCost(rows) {
  const keys = Object.keys(rows[0])
  let result = 0
  for (let left = 0; left < keys.length; left++) {
    for (let right = left + 1; right < keys.length; right++) {
      const counts = new Map()
      for (const row of rows) {
        const key = JSON.stringify([row[keys[left]], row[keys[right]]])
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }
      result += [...counts.values()].reduce((sum, count) => sum + count * count, 0)
    }
  }
  return result
}

describe('balanced condition assignments', () => {
  test('balances every prefix and visits every combination once across mixed-level designs', () => {
    // Exhaust every one-to-four-factor shape whose factors have one to four levels.
    let shapes = [[]]
    for (let dimensions = 1; dimensions <= 4; dimensions++) {
      shapes = shapes.flatMap(shape => [1, 2, 3, 4].map(length => [...shape, length]))
      for (const levels of shapes) {
        const options = optionsFor(levels)
        const rows = sequenceFor(options)
        expect(rows.length).toBe(levels.reduce((product, length) => product * length, 1))
        expect(new Set(rows.map(row => JSON.stringify(row))).size).toBe(rows.length)
        checkMarginals(rows, options)
        expect(getConditionsForAssignment(rows.length, options)).toEqual(rows[0])
      }
    }
  })

  test('improves pair coverage without sacrificing marginal balance', () => {
    const options = optionsFor([2, 2, 2, 2])
    const first = sequenceFor(options).slice(0, 4)
    const baseline = [
      { factor0: 0, factor1: 0, factor2: 0, factor3: 0 },
      { factor0: 1, factor1: 1, factor2: 1, factor3: 1 },
      { factor0: 0, factor1: 0, factor2: 0, factor3: 1 },
      { factor0: 1, factor1: 1, factor2: 1, factor3: 0 },
    ]
    checkMarginals(first, options)
    expect(pairCost(first)).toBeLessThan(pairCost(baseline))
  })

  test('preserves guarantees across repeated cycles and arbitrary assignment lookup order', () => {
    const options = optionsFor([2, 3, 4])
    const rows = sequenceFor(options)
    checkMarginals([...rows, ...rows, ...rows], options)
    for (let index = rows.length - 1; index >= 0; index--) {
      expect(getConditionsForAssignment(index + rows.length * 3, options)).toEqual(rows[index])
    }
    expect(getConditionsForAssignment(Number.MAX_SAFE_INTEGER, options))
      .toEqual(rows[Number.MAX_SAFE_INTEGER % rows.length])
  })

  test('maps cached index schedules to the current values and factor names', () => {
    const first = { label: 'first' }
    const second = { label: 'second' }
    const options = { treatment: [first, second], order: [['A', 'B'], ['B', 'A']] }
    const rows = sequenceFor(options)
    expect(rows[0].treatment).toBe(first)
    expect(rows[1].treatment).toBe(second)
    const renamed = { renamed: ['left', 'right'], number: [10, 20] }
    expect(getConditionsForAssignment(0, renamed)).toEqual({ renamed: 'left', number: 10 })
    expect(getConditionsForAssignment(1, renamed)).toEqual({ renamed: 'right', number: 20 })
  })

  test('accepts an empty design and rejects invalid options and assignments', () => {
    expect(getConditionAssignmentCount({})).toBe(1)
    expect(getConditionsForAssignment(23, {})).toEqual({})
    expect(() => getConditionsForAssignment(0, { empty: [] })).toThrow('non-empty array')
    expect(() => getConditionsForAssignment(0, { main: { treatment: [0, 1] } })).toThrow('non-empty array')
    for (const assignment of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => getConditionsForAssignment(assignment, {})).toThrow('non-negative safe integer')
    }
    const tooLarge = Object.fromEntries(Array.from({ length: 54 }, (_, index) => [index, [0, 1]]))
    expect(() => getConditionAssignmentCount(tooLarge)).toThrow('safe integer')
  })
})
