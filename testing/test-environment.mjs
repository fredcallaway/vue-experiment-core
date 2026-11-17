import { mock } from 'bun:test'
import * as os from 'node:os'

const nativeHomedir = os.homedir
// Bun 1.2 caches HOME in os.homedir(); keep test isolation consistent with Node.
mock.module('node:os', () => ({ ...os, homedir: () => process.env.HOME || nativeHomedir() }))

const originalValues = new Map()

export function stubEnv(name, value) {
  if (!originalValues.has(name)) originalValues.set(name, process.env[name])
  process.env[name] = value
}

export function restoreEnv() {
  for (const [name, value] of originalValues) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
  originalValues.clear()
}
