import { expect, test } from 'bun:test'
import { sessionAudio } from './session-audio'

const file = { saved: true, path: 'sessions/uid/s1/response%20one.webm', bucket: 'test.invalid',
  contentType: 'audio/webm', size: 30 }
const session = (events = [], files = {}) => ({
  meta: { sessionId: 's1', participantId: 'p1' }, events, other: { files },
})

test('the upload index makes recordings discoverable without a task-specific data view', () => {
  const rows = sessionAudio(session([], { clip: file,
    text: { ...file, path: 'notes.json', contentType: 'application/json' } }), 'fallback.invalid')
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({ sessionId: 's1', participantId: 'p1', filename: 'response one.webm',
    path: file.path, bucket: file.bucket, size: file.size })
})

test('existing event references and the file index deduplicate by bucket and path', () => {
  const rows = sessionAudio(session([
    { currentEpochId: 'trial[0]', data: { nested: [file] } },
    { currentEpochId: 'trial[1]', data: file },
    { data: { saved: false, path: null, contentType: 'audio/webm' } },
  ], { clip: file }), 'fallback.invalid')
  expect(rows).toHaveLength(1)
  expect(rows[0].epoch).toBe('trial[0]')
})

test('legacy audio paths, missing MIME types, and unusual filenames remain readable', () => {
  const rows = sessionAudio(session([
    { data: { audio_path: 'word-naming/p1/s1/old.m4a', audio_mime_type: 'audio/mp4', audio_bytes: 40 } },
    { data: { audio_path: 'word-naming/p1/s1/%bad.webm' } },
    { data: { audio_path: 'discarded.webm', saved_remotely: false } },
  ]), 'fallback.invalid')
  expect(rows.map(row => row.filename)).toEqual(['old.m4a', '%bad.webm'])
  expect(rows.every(row => row.bucket === 'fallback.invalid')).toBe(true)
})
