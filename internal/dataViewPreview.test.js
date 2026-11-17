import { expect, test } from 'vitest'
import { DataViewPreview } from './dataViewPreview'

const session = { meta: {}, events: [] }
const csv = fn => ({ format: 'csv', fn })

test('deepest whole epoch name wins over active ancestors and newer output', () => {
  const preview = new DataViewPreview()
  const views = { experiment: csv(() => []), trial: csv(() => []), choice: csv(() => []) }
  preview.update(views, session, false)
  expect(preview.select(Object.keys(views), ['CHOICE', 'trial', 'experiment'])).toBe('choice')
  expect(preview.select(['experiment', 'trial'], ['feedback', 'trial', 'experiment'])).toBe('trial')
  expect(preview.select(['experiment'], ['feedback', 'trial', 'experiment'])).toBe('experiment')
  views.experiment = csv(() => [{ count: 1 }])
  preview.update(views, session)
  expect(preview.select(Object.keys(views), ['trial', 'experiment'])).toBe('trial')
  expect(preview.select(Object.keys(views), ['trialDetails'])).toBe('experiment')
})

test('ambiguous names at the deepest matching level fall back to activity', () => {
  const preview = new DataViewPreview()
  const views = { experiment: csv(() => []), trial: csv(() => []), TRIAL: csv(() => []) }
  preview.update(views, session, false)
  views.TRIAL = csv(() => [{ correct: true }])
  preview.update(views, session)
  expect(preview.select(Object.keys(views), ['trial', 'experiment'])).toBe('TRIAL')
})

test('activity uses contents including cell edits, JSON changes, and cleared rows', () => {
  const preview = new DataViewPreview()
  const row = { nested: { audio_path: null } }
  let json = { notes: [] }
  let rows = []
  const views = { rows: csv(() => rows), details: { format: 'json', fn: () => json } }
  preview.update(views, session, false)
  json.notes.push('first')
  preview.update(views, session)
  expect(preview.select(Object.keys(views), [])).toBe('details')
  rows.push(row)
  const first = preview.update(views, session)
  expect(preview.select(Object.keys(views), [])).toBe('rows')
  json.notes.push('second')
  preview.update(views, session)
  expect(preview.select(Object.keys(views), [])).toBe('details')
  row.nested.audio_path = 'clip.webm'
  preview.update(views, session)
  expect(preview.select(Object.keys(views), [])).toBe('rows')
  expect(first.rows.data[0].nested.audio_path).toBe(null)
  json.notes.push('third')
  preview.update(views, session)
  expect(preview.select(Object.keys(views), [])).toBe('details')
  rows = []
  preview.update(views, session)
  expect(preview.select(Object.keys(views), [])).toBe('rows')
})

test('equal fresh objects and different key order do not create activity', () => {
  const preview = new DataViewPreview()
  let updated = false
  let reverseKeys = false
  const views = {
    first: csv(() => reverseKeys ? [{ b: 2, a: 1 }] : [{ a: 1, b: 2 }]),
    second: csv(() => updated ? [{ a: 3 }] : []),
  }
  preview.update(views, session, false)
  updated = true
  preview.update(views, session)
  reverseKeys = true
  preview.update(views, session)
  expect(preview.select(Object.keys(views), [])).toBe('second')
})

test('same-event updates tie without depending on transform evaluation order', () => {
  const preview = new DataViewPreview()
  let count = 0
  const views = { table: csv(() => [{ count }]), details: { format: 'json', fn: () => ({ count }) } }
  preview.update(views, session, false)
  count++
  preview.update(views, session)
  expect(preview.select(Object.keys(views), [], 'details')).toBe('details')
  expect(preview.select(Object.keys(views), [], 'removed')).toBe('table')
  count++
  preview.update(views, session)
  expect(preview.select(Object.keys(views), [], 'details')).toBe('details')
})

test('errors remain inspectable without hijacking activity or replacing successful snapshots', () => {
  const preview = new DataViewPreview()
  let fail = false, count = 0
  const views = {
    broken: csv(() => { if (fail) throw new Error('cannot parse'); return [] }),
    good: csv(() => [{ count }]),
  }
  preview.update(views, session, false)
  count++
  preview.update(views, session)
  fail = true
  expect(preview.update(views, session).broken).toEqual({ ok: false, error: 'cannot parse' })
  expect(preview.select(Object.keys(views), [])).toBe('good')
  expect(preview.select(Object.keys(views), ['broken'])).toBe('broken')
  fail = false
  preview.update(views, session)
  expect(preview.select(Object.keys(views), [])).toBe('good')
})

test('metadata changes are compared independently and removed views lose their history', () => {
  const preview = new DataViewPreview()
  const meta = { bonus: 0 }
  const views = { metadata: { format: 'json', fn: () => meta }, table: csv(() => []) }
  preview.update(views, session, false)
  meta.bonus = 1
  preview.update(views, session)
  expect(preview.select(Object.keys(views), [])).toBe('metadata')
  delete views.metadata
  preview.update(views, session)
  views.metadata = { format: 'json', fn: () => meta }
  preview.update(views, session, false)
  expect(preview.select(Object.keys(views), [], 'table')).toBe('table')
})
