import { expect, test } from 'bun:test'
import { createStudyRequest } from './createStudyRequest'

const fake = '111111111111111111111111'
const valid = '636d6ce3fb3683ff33f9e514'
const rejection = (detail) => ({ response: { status: 400 }, data: {
  error: { error_code: 140003, detail },
} })

test('creation preserves real exclusions and retries only explicitly nonexistent blocklisted IDs', async () => {
  const body = { name: 'study', filters: [{ filter_id: 'custom_blocklist', selected_values: [fake, valid] }] }
  const sent = []
  const result = await createStudyRequest(body, async payload => {
    sent.push(payload)
    if (sent.length === 1) throw rejection({ 0: { invalid_ids: [], invalid_user_ids: [fake] } })
    return { id: 'created' }
  })
  expect(result).toEqual({ id: 'created' })
  expect(sent[1].filters[0].selected_values).toEqual([valid])
  expect(body.filters[0].selected_values).toEqual([fake, valid])
})

test('drops an emptied blocklist while preserving other filters', async () => {
  const other = { filter_id: 'language', selected_values: ['19'] }
  let calls = 0
  await createStudyRequest({ filters: [other, { filter_id: 'custom_blacklist', selected_values: [fake] }] }, async p => {
    if (++calls === 1) throw rejection({ 1: { invalid_user_ids: [fake], invalid_ids: [] } })
    expect(p.filters).toEqual([other])
  })
})

test.each(['custom_allowlist', 'language'])('does not relax non-blocklist eligibility: %s', async filter_id => {
  const error = rejection({ 0: { invalid_user_ids: [fake] } })
  let calls = 0
  await expect(createStudyRequest({ filters: [{ filter_id, selected_values: [fake] }] }, async () => {
    calls++; throw error
  })).rejects.toBe(error)
  expect(calls).toBe(1)
})

test('does not retry unrelated errors or a second rejection', async () => {
  const error = rejection({ 0: { invalid_user_ids: [fake] } })
  let calls = 0
  await expect(createStudyRequest({ filters: [{ filter_id: 'custom_blocklist', selected_values: [fake] }] }, async () => {
    calls++; throw error
  })).rejects.toBe(error)
  expect(calls).toBe(2)
  calls = 0
  await expect(createStudyRequest({}, async () => { calls++; throw new Error('network') })).rejects.toThrow('network')
  expect(calls).toBe(1)
})
