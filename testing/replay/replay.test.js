import { describe, expect, test } from 'bun:test'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import { assertExpectations, compareCheckpoint, digest, traceHash, validateStep, validateTrace } from './index.mjs'

const trace = () => ({
  version: 1, id: 'choice', startUrl: 'http://localhost:3030/dev?testing=1',
  viewport: { width: 1280, height: 900 }, scope: { kind: 'section', label: 'A choice trial' },
  steps: [{ action: 'checkpoint', name: 'ready' }, { action: 'press', key: 'ArrowLeft' },
    { action: 'checkpoint', name: 'done' }],
  completion: [{ kind: 'event', name: 'choice', count: 1, where: { choice: 'left' } }],
})

describe('agent trace contract', () => {
  test('rejects malformed traces instead of silently dropping assertions or actions', () => {
    for (const change of [
      value => { value.steps = [] },
      value => { value.completion = [] },
      value => { value.viewport.width = 0 },
      value => { value.scope.kind = 'trial' },
      value => { value.steps.push({ action: 'evaluate', code: 'epoch.done()' }) },
      value => { value.steps.push({ action: 'click', target: { role: 'button', css: '#choice' } }) },
      value => { value.steps.push({ action: 'checkpoint', name: '../escape' }) },
      value => { value.steps.push({ action: 'checkpoint', name: 'ready' }) },
      value => { value.steps.push({ action: 'press', key: 'Space' }) },
      value => { value.steps[0].masks = [{ selector: '#volatile' }] },
      value => { value.completion = [{ kind: 'event', name: 'choice', count: -1 }] },
      value => { value.completion = [{ kind: 'event', name: 'choice', count: 1, minCount: 1 }] },
      value => { value.runtime = { fast: 'true' } },
      value => { value.completion = [{ kind: 'visible', target: { text: 'Done' }, value: 'ignored' }] },
    ]) {
      const value = trace()
      change(value)
      expect(() => validateTrace(value)).toThrow()
    }
  })

  test('rejects action fields that would otherwise look supported but do nothing', () => {
    expect(() => validateStep({ action: 'press', key: 'Space', checked: false })).toThrow('not used')
    expect(() => validateStep({ action: 'check', target: { label: 'Consent' } })).toThrow('boolean')
    expect(() => validateStep({ action: 'fill', target: { label: 'Name' }, value: '' })).not.toThrow()
  })

  test('trace hashing ignores object key order and detects changed behavior', () => {
    expect(digest({ b: 2, a: 1 })).toBe(digest({ a: 1, b: 2 }))
    const original = trace()
    const changed = structuredClone(original)
    changed.steps[1].key = 'ArrowRight'
    expect(traceHash(original)).not.toBe(traceHash(changed))
  })

  test('semantic assertions require an actual reader and exact nested payloads', async () => {
    await expect(assertExpectations({}, trace().completion)).rejects.toThrow('require readEvents')
    await expect(assertExpectations({}, trace().completion, {
      readEvents: async () => [{ eventType: 'choice', data: { choice: 'right' } }], timeoutMs: 1,
    })).rejects.toThrow('Assertion failed')
    await assertExpectations({}, trace().completion, {
      readEvents: async () => [{ eventType: 'choice', data: { choice: 'left', rt: 450 } }],
    })
    await expect(assertExpectations({}, [{ kind: 'event', name: 'choice', count: 1 }], {
      readEvents: async () => [{ eventType: 'choice', data: {} }, { eventType: 'choice', data: {} }], timeoutMs: 1,
    })).rejects.toThrow('Assertion failed')
    await assertExpectations({}, [{ kind: 'event', name: 'error', count: 0 }], { readEvents: async () => [] })
  })

  test('tolerates only bounded RGB quantization and catches subtle stimulus color changes', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'experiment-pixel-invariants-'))
    async function checkpoint(name, count, delta, channel = 0) {
      const png = new PNG({ width: 100, height: 100 })
      png.data.fill(255)
      for (let pixel = 0; pixel < count; pixel++) png.data[pixel * 4 + channel] -= delta
      const bytes = PNG.sync.write(png)
      const screenshotPath = join(directory, `${name}.png`)
      await writeFile(screenshotPath, bytes)
      return { name: 'stimulus', structure: {}, structureHash: digest({}), screenshotPath, screenshotHash: digest(bytes) }
    }
    const expected = await checkpoint('expected', 0, 0)
    const noise = await compareCheckpoint(await checkpoint('noise', 7, 1), expected)
    expect(noise.matched).toBe(true)
    expect(noise.suppressedPixels).toBe(7)
    expect((await compareCheckpoint(await checkpoint('twenty-one', 21, 1), expected)).matched).toBe(false)
    expect((await compareCheckpoint(await checkpoint('two-levels', 1, 2), expected)).matched).toBe(false)
    expect((await compareCheckpoint(await checkpoint('color', 6400, 20, 1), expected)).matched).toBe(false)
  })
})
