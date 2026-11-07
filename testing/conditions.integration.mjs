import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const origin = process.argv[2] ?? 'http://localhost:3030'
assert(['localhost', '127.0.0.1'].includes(new URL(origin).hostname), 'Use a local development server')
const output = new URL('../../.experiment-tests/conditions/', import.meta.url)
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
const errors = []
const writes = []
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
  await context.route('**/*', route => {
    const request = route.request()
    if (new URL(request.url()).origin === origin && ['GET', 'HEAD'].includes(request.method())) {
      return route.continue()
    }
    if (!['GET', 'HEAD'].includes(request.method()) && !new URL(request.url()).hostname.endsWith('.posthog.com')) {
      writes.push(request.url())
    }
    return route.abort()
  })
  await context.routeWebSocket('**/*', socket => {
    if (new URL(socket.url()).host === new URL(origin).host) socket.connectToServer()
    else socket.close()
  })
  const page = await context.newPage()
  page.setDefaultTimeout(15_000)
  page.on('pageerror', error => errors.push(error.message))
  const read = () => page.evaluate(async () => {
    const { useConditions } = await import('/_nuxt/core/composables/useCondition.ts')
    const { useCurrentSession } = await import('/_nuxt/core/composables/useCurrentSession.ts')
    const api = useConditions()
    return { conditions: api.conditions, options: api.options, pins: api.isPinned,
      metadata: useCurrentSession().conditions, api: Object.keys(api) }
  })
  const load = async (assignment, params = {}) => {
    const query = new URLSearchParams({ testing: '1', assignment: String(assignment), ...params })
    await page.goto(`${origin}/examples/configuration?${query}`)
    await page.getByText("This session's assigned configuration:", { exact: true }).waitFor()
    return read()
  }

  const first = await load(0)
  const keys = Object.keys(first.options)
  const count = Object.values(first.options).reduce((product, values) => product * values.length, 1)
  assert.deepEqual(first.api.sort(), ['assign', 'conditions', 'isPinned', 'options'])
  const rows = []
  for (let assignment = 0; assignment < count; assignment++) {
    const result = await load(assignment)
    assert.deepEqual(result.conditions, result.metadata, 'Assigned conditions must be saved in session metadata')
    rows.push(result.conditions)
    for (const key of keys) {
      const counts = first.options[key].map(value => rows.filter(row => row[key] === value).length)
      assert(Math.max(...counts) - Math.min(...counts) <= 1, 'Rendered example must balance every prefix')
    }
  }
  assert.equal(new Set(rows.map(row => JSON.stringify(row))).size, count)
  assert.deepEqual((await load(count)).conditions, first.conditions)

  const pinnedKey = keys[0]
  const pinnedValue = first.options[pinnedKey].at(-1)
  const pinned = await load(0, { [`condition.${pinnedKey}`]: String(pinnedValue) })
  assert.equal(pinned.conditions[pinnedKey], pinnedValue, 'Initial URL pin must survive registration')
  assert.equal(pinned.pins[pinnedKey], true)
  const next = await load(1, { [`condition.${pinnedKey}`]: String(pinnedValue) })
  assert.equal(next.conditions[pinnedKey], pinnedValue)
  assert.notDeepEqual(next.conditions, pinned.conditions, 'Unpinned factors must continue cycling')

  const repeated = await page.evaluate(async () => {
    const { useConditions } = await import('/_nuxt/core/composables/useCondition.ts')
    const api = useConditions()
    const before = JSON.stringify(api.conditions)
    api.assign({ ...api.options })
    api.assign({ ...api.options })
    return { before, after: JSON.stringify(api.conditions) }
  })
  assert.equal(repeated.after, repeated.before, 'Complete declarations may be evaluated repeatedly')
  await page.screenshot({ path: new URL('pinned-example.png', output).pathname })
  await page.getByRole('link', { name: 'Docs', exact: true }).click()
  await page.waitForURL('**/docs')
  await page.goBack()
  await page.getByText("This session's assigned configuration:", { exact: true }).waitFor()
  assert.deepEqual((await read()).conditions, next.conditions, 'SPA remount must reproduce the assignment and pin')

  const arrayPin = await page.evaluate(async () => {
    const { useConditions } = await import('/_nuxt/core/composables/useCondition.ts')
    const { useUrlParams } = await import('/_nuxt/core/utils/url-params.ts')
    useUrlParams()['condition.order'] = JSON.stringify(['B', 'A'])
    const api = useConditions()
    api.assign({ order: [['A', 'B'], ['B', 'A']], size: [1, 2, 3] })
    return { conditions: api.conditions, keys: Object.keys(api.options), pinned: api.isPinned.order }
  })
  assert.deepEqual(arrayPin.conditions.order, ['B', 'A'])
  assert.equal(arrayPin.pinned, true)
  assert.deepEqual(arrayPin.keys.sort(), ['order', 'size'], 'A complete declaration replaces earlier factors')

  assert.deepEqual(errors, [])
  assert.deepEqual(writes, [])
  await writeFile(new URL('result.json', output), JSON.stringify({ origin, rows, pinned, arrayPin, errors, writes }, null, 2))
  console.log('Passed: balanced rendered assignments, unique cycle, initial and array URL pins, metadata, repeat calls,')
  console.log('SPA remount, complete-design replacement, and zero network writes.')
} finally {
  await browser.close()
}
