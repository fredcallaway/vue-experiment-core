import { describe, expect, test } from 'bun:test'
import { getConditionAssignmentCount, getConditionsForAssignment } from './conditions'

const design = {
  main: {
    treatment: ['control', 'treatment'],
  },
  counterbalance: {
    taskOrder: ['AB', 'BA'],
    responseSide: ['left', 'right'],
  },
}

describe('getConditionsForAssignment', () => {
  test('holds counterbalances fixed while iterating through main conditions', () => {
    const assignments = Array.from({ length: getConditionAssignmentCount(design) }, (_, assignment) => {
      return getConditionsForAssignment(assignment, design)
    })

    expect(assignments).toEqual([
      { treatment: 'control', taskOrder: 'AB', responseSide: 'left' },
      { treatment: 'treatment', taskOrder: 'AB', responseSide: 'left' },
      { treatment: 'control', taskOrder: 'BA', responseSide: 'right' },
      { treatment: 'treatment', taskOrder: 'BA', responseSide: 'right' },
      { treatment: 'control', taskOrder: 'AB', responseSide: 'right' },
      { treatment: 'treatment', taskOrder: 'AB', responseSide: 'right' },
      { treatment: 'control', taskOrder: 'BA', responseSide: 'left' },
      { treatment: 'treatment', taskOrder: 'BA', responseSide: 'left' },
    ])
  })

  test('keeps the existing nested order within the main design', () => {
    const nestedDesign = {
      main: {
        treatment: ['control', 'treatment'],
        prompt: ['short', 'long'],
      },
      counterbalance: {
        taskOrder: ['AB', 'BA'],
      },
    }

    expect(Array.from({ length: 5 }, (_, assignment) => {
      return getConditionsForAssignment(assignment, nestedDesign)
    })).toEqual([
      { treatment: 'control', prompt: 'short', taskOrder: 'AB' },
      { treatment: 'treatment', prompt: 'short', taskOrder: 'AB' },
      { treatment: 'control', prompt: 'long', taskOrder: 'AB' },
      { treatment: 'treatment', prompt: 'long', taskOrder: 'AB' },
      { treatment: 'control', prompt: 'short', taskOrder: 'BA' },
    ])
  })

  test('repeats after a complete assignment cycle', () => {
    const cycleLength = getConditionAssignmentCount(design)
    expect(getConditionsForAssignment(cycleLength, design)).toEqual(getConditionsForAssignment(0, design))
  })

  test('rejects invalid designs and assignments', () => {
    expect(() => getConditionsForAssignment(-1, design)).toThrow('non-negative safe integer')
    expect(() => getConditionsForAssignment(0, {
      main: { treatment: [] },
      counterbalance: {},
    })).toThrow('has no values')
    expect(() => getConditionsForAssignment(0, {
      main: { treatment: ['control'] },
      counterbalance: { treatment: ['treatment'] },
    })).toThrow('both main and counterbalance')
  })
})
