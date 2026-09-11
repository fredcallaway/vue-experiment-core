import { describe, expect, test } from 'bun:test'
import { getProlificErrorMessage } from './prolificErrorMessage'

describe('getProlificErrorMessage', () => {
  test('extracts actionable details from the Prolific proxy response', () => {
    const error = { interactive: true, detail: ['Top up your account.', 'Then try again.'] }
    expect(getProlificErrorMessage(400, { data: { error } })).toBe('Top up your account.\nThen try again.')
    expect(getProlificErrorMessage(400, { error: { ...error, detail: ' Top up your account. ' } }))
      .toBe('Top up your account.')
  })

  test.each([
    [500, { interactive: true, detail: ['Server failure'] }],
    [401, { interactive: true, detail: ['Invalid credentials'] }],
    [400, { interactive: false, detail: ['Invalid request'] }],
    [400, { detail: ['Invalid request'] }],
    [400, { interactive: true, detail: [] }],
    [400, { interactive: true, detail: [''] }],
    [400, { interactive: true, detail: ['Valid detail', { field: 'Invalid' }] }],
    [400, { interactive: true, title: 'Generic error' }],
    [400, null],
  ])('preserves unexpected or malformed errors (%s, %j)', (status, error) => {
    expect(getProlificErrorMessage(status, { data: { error } })).toBeNull()
  })
})
