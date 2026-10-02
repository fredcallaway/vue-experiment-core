import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { assertFirebaseProjectMatchesCli } from './firebase-project'

const roots = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function project() {
  const root = await mkdtemp(resolve(tmpdir(), 'firebase-project-test-'))
  roots.push(root)
  await writeFile(resolve(root, 'firebase.config.json'), JSON.stringify({ projectId: 'experiment-one' }))
  return root
}

test('accepts a matching CLI project', async () => {
  const root = await project()
  const run = (command, args) => {
    expect(command).toBe('firebase')
    expect(args).toEqual(['use', '--json'])
    return JSON.stringify({ status: 'success', result: 'experiment-one' })
  }
  expect(await assertFirebaseProjectMatchesCli(root, run)).toBe('experiment-one')
})

test('rejects a Hosting project that differs from the app project', async () => {
  const root = await project()
  const run = () => JSON.stringify({ status: 'success', result: 'experiment-two' })
  await expect(assertFirebaseProjectMatchesCli(root, run)).rejects.toThrow('differs from firebase.config.json')
})

test('requires a selected CLI project', async () => {
  const root = await project()
  const run = () => JSON.stringify({ status: 'error', error: 'No project selected' })
  await expect(assertFirebaseProjectMatchesCli(root, run)).rejects.toThrow('Select a Firebase CLI project')
})
