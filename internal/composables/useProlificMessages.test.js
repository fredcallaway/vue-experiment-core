import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test'
import { effectScope, ref } from 'vue'

const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value))

let database
let prolific
mock.module('../../composables/useDatabase', () => ({ useDatabase: () => database }))
mock.module('./useProlific', () => ({ useProlific: () => prolific }))
let useProlificMessages
let testIndex = 0

const NOW = Date.parse('2026-09-24T12:00:00Z')
const DAY = 86400000
const STUDY = 'aaaaaaaaaaaaaaaaaaaaaaaa'
const PARTICIPANT = 'bbbbbbbbbbbbbbbbbbbbbbbb'
const RESEARCHER = 'cccccccccccccccccccccccc'
const KEY = `${STUDY}-${PARTICIPANT}`
const RECENT = new Date(NOW - DAY).toISOString()
const OLD = '2026-02-23T15:25:32.339Z'
const message = (body = 'Recent message') => ({
  id: 'message-id', body, datetime_created: RECENT, sender_id: PARTICIPANT, data: { study_id: STUDY },
})
const cached = (body, timestamp = NOW - 100 * DAY) => ({ body, timestamp, isResearcher: false })
const correspondence = (messages, resolved = false) => ({
  studyId: STUDY, participantId: PARTICIPANT, resolved, timestamp: messages.at(-1)?.timestamp ?? 0, messages,
})
let scope
let clock
let originalStorage
let values
let listeners
let writes
let calls
let failWrite
let failRead
let listMessages
let userMessages
let failRequest
let finishRequest

beforeEach(async () => {
  // Re-evaluate the module to give each test its own createGlobalState instance.
  const module = await import(`./useProlificMessages.ts?test=${testIndex++}`)
  useProlificMessages = module.useProlificMessages
  clock = spyOn(Date, 'now').mockReturnValue(NOW)
  originalStorage = globalThis.localStorage
  globalThis.localStorage = { getItem: () => RESEARCHER, setItem: () => {} }
  values = { '/messagesRefreshTime': OLD, '/messages': {} }
  listeners = {}
  writes = []
  calls = []
  failWrite = null
  failRead = null
  failRequest = null
  finishRequest = () => {}
  listMessages = []
  userMessages = []
  database = {
    onValue(path, callback) {
      listeners[path] = callback
      callback({ val: () => clone(values[path]) })
    },
    async get(path) {
      if (path === failRead) throw new Error('read failed')
      const value = path.startsWith('/messages/') ? values['/messages'][path.slice(10)] : values[path]
      return { val: () => clone(value) }
    },
    async set(path, value) {
      if (path === failWrite) throw new Error('write failed')
      writes.push(path)
      values[path] = clone(value)
      if (path.startsWith('/messages/')) {
        values['/messages'][path.slice('/messages/'.length)] = clone(value)
        listeners['/messages']?.({ val: () => clone(values['/messages']) })
      }
      listeners[path]?.({ val: () => clone(values[path]) })
    },
  }
  prolific = {
    studyList: { value: { items: ref([{ id: STUDY }]) } },
    async request(method, path) {
      calls.push({ method, path })
      if (path.includes(failRequest ?? 'never-match')) throw new Error('request failed')
      finishRequest()
      return { results: path.includes('user_id=') ? userMessages : listMessages }
    },
  }
  scope = effectScope()
})

afterEach(() => {
  scope.stop()
  clock.mockRestore()
  globalThis.localStorage = originalStorage
})

const start = () => scope.run(() => useProlificMessages())

describe('Prolific message refresh', () => {
  test.each([
    ['stale', OLD], ['absent', null], ['invalid', 'invalid'],
    ['future', new Date(NOW + DAY).toISOString()],
  ])('%s cursor stays within the API retrieval window', async (_, cursor) => {
    values['/messagesRefreshTime'] = cursor
    const messages = start()
    await messages.refresh()
    const after = Date.parse(calls[0].path.split('created_after=')[1])
    expect(after).toBeGreaterThan(NOW - 30 * DAY)
    expect(after).toBeLessThanOrEqual(NOW - 28 * DAY)
    expect(values['/messagesRefreshTime']).toBe(new Date(NOW).toISOString())
    expect(messages.lastRefreshTimestamp.value).toBe(NOW)
    expect(messages.isLoading.value).toBe(false)
  })

  test('recent cursors stay incremental and successful refresh saves the start, not finish time', async () => {
    values['/messagesRefreshTime'] = RECENT
    finishRequest = () => clock.mockReturnValue(NOW + 5000)
    await start().refresh()
    expect(calls[0].path).toBe(`/messages?created_after=${RECENT}`)
    expect(values['/messagesRefreshTime']).toBe(new Date(NOW).toISOString())
  })

  test('merges cached history, preserves matching duplicates, and is idempotent on retry', async () => {
    const older = cached('Old message')
    const overlap = cached('Recent message', Date.parse(RECENT))
    values['/messages'][KEY] = correspondence([older, overlap, overlap])
    values['/messages'].unrelated = correspondence([cached('Untouched')], true)
    listMessages = [message()]
    userMessages = [message(), message(), message('New reply')]
    const messages = start()
    listeners['/messages']({ val: () => ({}) })
    await messages.refresh()
    await messages.refresh()
    expect(values['/messages'][KEY].messages).toEqual([older, overlap, overlap, cached('New reply', Date.parse(RECENT))])
    expect(values['/messages'].unrelated.resolved).toBe(true)
    expect(values['/messages'].unrelated.messages).toEqual([cached('Untouched')])
    expect(writes.at(-1)).toBe('/messagesRefreshTime')
    expect(calls.every(c => c.method === 'GET')).toBe(true)
  })

  test('individual and empty refreshes keep cached history and resolved status', async () => {
    const original = correspondence([cached('Old message')], true)
    values['/messages'][KEY] = original
    const messages = start()
    await messages.refreshCorrespondence(STUDY, PARTICIPANT)
    await messages.refresh()
    expect(values['/messages'][KEY]).toEqual(original)
  })

  test.each(['list', 'conversation', 'cache read', 'cache', 'cursor'])('%s failure preserves the cursor and clears loading', async stage => {
    values['/messages'][KEY] = correspondence([cached('Old message')])
    listMessages = [message()]
    userMessages = [message()]
    if (stage === 'list') failRequest = 'created_after='
    if (stage === 'conversation') failRequest = 'user_id='
    if (stage === 'cache read') failRead = `/messages/${KEY}`
    if (stage === 'cache') failWrite = `/messages/${KEY}`
    if (stage === 'cursor') failWrite = '/messagesRefreshTime'
    const messages = start()
    await expect(messages.refresh()).rejects.toThrow('failed')
    expect(values['/messagesRefreshTime']).toBe(OLD)
    expect(messages.lastRefreshTimestamp.value).toBe(Date.parse(OLD))
    expect(messages.isLoading.value).toBe(false)
    expect(values['/messages'][KEY].messages[0]).toEqual(cached('Old message'))
    failRequest = null
    failRead = null
    failWrite = null
    await messages.refresh()
    expect(values['/messages'][KEY].messages).toHaveLength(2)
    expect(messages.lastRefreshTimestamp.value).toBe(NOW)
  })
})
