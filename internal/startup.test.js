import { expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'

// Run with isolated globals and module state, as in a fresh browser session.
test('startup preserves native randomness and installs the seeded stream and promise polyfill', () => {
  const result = spawnSync(process.execPath, ['--eval', `
    import { strict as assert } from 'node:assert'
    import { ref, reactive } from 'vue'
    Object.assign(globalThis, { ref, reactive, defineNuxtPlugin: plugin => plugin })
    globalThis.window = { location: { search: '?session_id=startup-test&mode=debug' } }

    const nativeRandom = Math.random
    const { defineEpochConfig } = await import('./composables/useConfig.ts')
    defineEpochConfig({ title: 'Test', version: 'test', icon: '', contactEmail: '', completion: { mode: 'prolific' } })
    const { random, trueRandom } = await import('./utils/random.ts')
    assert.equal(Math.random, nativeRandom, 'importing the generator must not install the override')
    assert.equal(trueRandom, nativeRandom, 'native randomness must be captured before installation')
    const expected = Array.from({ length: 5 }, () => random.float())
    random.reset()
    const plugin = (await import('./plugins/01.random.client.ts')).default
    await plugin.setup()
    assert.notEqual(Math.random, nativeRandom)
    assert.deepEqual(Array.from({ length: 5 }, () => Math.random()), expected)
    random.reset()
    trueRandom()
    assert.equal(Math.random(), expected[0], 'native randomness must not advance the seeded stream')

    const polyfills = (await import('./plugins/00.polyfills.client.ts')).default
    const nativeResolvers = Promise.withResolvers
    polyfills.setup()
    assert.equal(Promise.withResolvers, nativeResolvers, 'preserve native implementations')
    delete Promise.withResolvers
    polyfills.setup()
    const { promise, resolve } = Promise.withResolvers()
    resolve(42)
    assert.equal(await promise, 42)
    const rejected = Promise.withResolvers()
    const handled = rejected.promise.catch(error => error)
    rejected.reject('expected rejection')
    assert.equal(await handled, 'expected rejection')
    const installed = Promise.withResolvers
    polyfills.setup()
    assert.equal(Promise.withResolvers, installed, 'installation must be idempotent')
  `], { cwd: new URL('..', import.meta.url), encoding: 'utf8' })
  expect(result.stderr + result.stdout).not.toContain('AssertionError')
  expect(result.status).toBe(0)
})
