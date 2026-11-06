import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { safeBrowser } from './browser.mjs'

const project = fileURLToPath(new URL('../../', import.meta.url))
const output = resolve('.experiment-tests/data-preview')
await mkdir(output, { recursive: true })
let origin = process.argv[2], server, log, browser
const checks = []
try {
  if (!origin) {
    const reservation = createServer()
    await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve))
    const port = reservation.address().port
    await new Promise(resolve => reservation.close(resolve))
    origin = `http://127.0.0.1:${port}`
    log = createWriteStream(resolve(output, 'server.log'))
    server = spawn(process.execPath, [resolve(project, 'node_modules/nuxt/bin/nuxt.mjs'), 'dev',
      resolve(project, 'core/testing/fixtures/data-preview'), '--host', '127.0.0.1', '--port', String(port)],
    { cwd: project, stdio: ['ignore', 'pipe', 'pipe'] })
    server.stdout.pipe(log)
    server.stderr.pipe(log)
    const deadline = Date.now() + 90_000
    while (true) {
      if (server.exitCode !== null) throw new Error(`Preview fixture exited; see ${output}/server.log`)
      try { if ((await fetch(`${origin}/dev`, { signal: AbortSignal.timeout(2000) })).ok) break } catch { /* Starting. */ }
      if (Date.now() > deadline) throw new Error(`Preview fixture timed out; see ${output}/server.log`)
      await delay(200)
    }
  }
  browser = await safeBrowser({ url: `${origin}/dev`, viewport: { width: 1800, height: 1100 } })
  const { page } = browser
  const url = new URL(browser.url)
  url.searchParams.set('preview', '0')
  await page.goto(url.href)
  const selector = page.getByRole('combobox', { name: 'Data view', exact: true })
  const click = name => page.getByRole('button', { name, exact: true }).click()
  const selected = async (name, reason) => {
    await page.waitForFunction(name => {
      const select = document.querySelector('select[aria-label="Data view"]')
      return select?.selectedOptions[0]?.textContent === `auto (${name})`
    }, name)
    assert.equal(await selector.inputValue(), '')
    checks.push(reason)
  }
  await selector.waitFor({ timeout: 60_000 })
  await selected('instructions', 'No history falls back to first declaration')
  await click('Log instructions')
  await click('Log response')
  await selected('trials', 'Mismatched epoch name follows changed rows')
  await click('Update JSON')
  await selected('details', 'JSON-only update selects JSON')
  await click('Log unrelated event')
  await selected('details', 'Equal freshly allocated outputs preserve selection')
  await click('Save recording')
  await selected('details', 'Simultaneous cell/JSON changes retain the current view')
  await selector.selectOption('instructions')
  await click('Log response')
  assert.equal(await selector.inputValue(), 'instructions')
  await selector.selectOption('')
  await selected('details', 'Auto activity continues while manually pinned')
  await click('Update metadata')
  await selected('metadata', 'Metadata-only output change is tracked')
  await click('Save recording')
  await selected('trials', 'A changed cell without row growth updates recency')
  const panel = page.locator('.border').filter({ has: selector }).last()
  await panel.getByText('clip-2.webm', { exact: true }).first().waitFor()
  await click('Clear rows')
  await selected('trials', 'Clearing rows is output activity')
  await panel.getByText('No rows yet.', { exact: true }).waitFor()
  await click('Fail transform')
  await selected('trials', 'Unrelated errors do not take over Auto')
  await selector.selectOption('broken')
  await panel.getByText('Synthetic transform failure', { exact: true }).waitFor()
  await selector.selectOption('')
  await click('Enter survey')
  await selected('survey', 'Case-insensitive whole name selects an empty upcoming view')
  await click('Submit survey')
  await click('Finish fixture')
  await selected('survey', 'Unmatched completion retains latest output')
  await page.screenshot({ path: resolve(output, 'recency.png') })

  // A fresh browser load starts a fresh preview history, while retaining explicit manual preferences.
  await selector.selectOption('details')
  await page.reload()
  await page.getByRole('heading', { name: 'Data preview fixture' }).waitFor()
  assert.equal(await selector.inputValue(), 'details')
  await selector.selectOption('')
  await selected('instructions', 'Reload resets activity and retains the persisted manual preference')
  await click('Add ancestor and trial views')
  await selected('trial', 'Deep trial match beats experiment ancestor before rows exist')
  await click('Update JSON')
  await click('Log unrelated event')
  await selected('trial', 'Deep name match beats newer JSON and continually updated experiment output')
  await click('Log response')
  await page.screenshot({ path: resolve(output, 'deepest-match.png') })
  await click('Enter survey')
  await selected('survey', 'Survey also beats the experiment ancestor')
  await click('Finish fixture')
  await selected('experiment', 'Ancestor match remains useful without a deeper named view')

  // Discover the actual target rather than constructing an epoch ID.
  const trialId = await page.locator('[data-epoch-id]').evaluateAll(nodes =>
    nodes.map(node => node.dataset.epochId).find(id => id.endsWith('-trial')))
  assert.ok(trialId)
  const jump = new URL(url)
  jump.searchParams.set('jump', trialId)
  await page.goto(jump.href)
  await page.getByRole('heading', { name: 'Data preview fixture' }).waitFor()
  await click('Log response')
  await selected('trials', 'Jumped Develop run still tracks new output')
  const state = await browser.readState()
  assert.equal(state.writerInitialized, false)
  assert.deepEqual(browser.errors, [])
  // The inherited fixture deliberately points telemetry at a nonfunctional host; it remains blocked.
  assert.deepEqual(browser.blockedRequests.filter(request => new URL(request.url).hostname !== 'outline-fixture.invalid'), [])
  checks.push('No browser errors or backend writes; all external traffic blocked')
  await writeFile(resolve(output, 'result.json'), JSON.stringify({ checks, errors: browser.errors,
    blockedRequests: browser.blockedRequests }, null, 2) + '\n')
  console.log(`${checks.length} Data preview integration checks passed; evidence: ${output}`)
} finally {
  await browser?.close()
  if (server?.exitCode === null) {
    server.kill('SIGTERM')
    await new Promise(resolve => server.once('exit', resolve))
  }
  log?.end()
}
