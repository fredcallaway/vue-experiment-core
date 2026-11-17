import { expect, test } from 'vitest'
import { createFatalErrorReport } from './fatalErrorReport'

test('preserves original messages, stacks, causes, and optional build context', () => {
  const original = new Error('Original setup failure')
  const error = new Error('Nuxt wrapper', { cause: original })
  const report = createFatalErrorReport(error, { path: '/prolific/create?token=private',
    deployment: JSON.stringify({ id: 'build-1', version: 'pilot', fullSha: 'abc123', ignored: 'private data' }) })
  for (const expected of ['Nuxt wrapper', original.stack, 'Page: /prolific/create', 'Build: abc123',
    'Deployment: build-1', 'Dataset: pilot']) expect(report).toContain(expected)
  expect(report).not.toContain('?token=private')
  expect(report).not.toContain('private data')
})

test('works with missing or malformed context and non-Error thrown values', () => {
  expect(createFatalErrorReport('Startup failed', { deployment: '{' })).toContain('Startup failed')
  expect(createFatalErrorReport({ statusCode: 503, statusMessage: 'Service unavailable' }))
    .toContain('Status: 503')
  expect(createFatalErrorReport(undefined)).toContain('Unknown error')
})

test('does not traverse error payloads and tolerates throwing properties and circular causes', () => {
  const error = { message: 'Primary failure', data: { answer: 'private answer' } }
  Object.defineProperty(error, 'stack', { get() { throw new Error('Broken getter') } })
  error.cause = error
  const report = createFatalErrorReport(error)
  expect(report).toContain('Primary failure')
  expect(report).toContain('Repeated cause')
  expect(report).not.toContain('private answer')
  expect(report).not.toContain('Broken getter')
})

test('strips URL queries, fragments, credentials, and common credential values from diagnostics', () => {
  const error = new Error('token=secret-value https://user:password@example.com/exp?PROLIFIC_PID=private#answer')
  error.stack = 'Error at https://example.com/app.js?token=private:12:34\nBearer private-bearer apiKey=private-key'
  const report = createFatalErrorReport(error)
  expect(report).toContain('https://example.com/app.js:12:34')
  for (const secret of ['secret-value', 'password', 'PROLIFIC_PID', 'private', '#answer', 'user:']) {
    expect(report).not.toContain(secret)
  }
})

test('bounds oversized diagnostics and deep cause chains', () => {
  const error = { message: 'x'.repeat(100_000) }
  error.cause = { message: 'Nested cause', cause: error }
  expect(createFatalErrorReport(error).length).toBeLessThan(error.message.length)
})
