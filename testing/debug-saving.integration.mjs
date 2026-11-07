import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

// The real navigation, session controller, and writer run against an in-memory database.
const project = fileURLToPath(new URL('../../', import.meta.url))
const output = resolve('.experiment-tests/debug-saving')
await mkdir(output, { recursive: true })
const reservation = createServer()
await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve))
const port = reservation.address().port
await new Promise(resolve => reservation.close(resolve))
const origin = `http://127.0.0.1:${port}`
const log = createWriteStream(resolve(output, 'server.log'))
const server = spawn(process.execPath, [resolve(project, 'node_modules/nuxt/bin/nuxt.mjs'),
  'dev', resolve(project, 'core/testing/fixtures/debug-saving'), '--host', '127.0.0.1', '--port', String(port)],
{ cwd: project, stdio: ['ignore', 'pipe', 'pipe'] })
server.stdout.pipe(log)
server.stderr.pipe(log)
let browser
try {
  const deadline = Date.now() + 90_000
  while (true) {
    if (server.exitCode !== null) throw new Error(`Fixture failed; see ${output}/server.log`)
    try { if ((await fetch(origin, { signal: AbortSignal.timeout(2000) })).ok) break } catch { /* Starting. */ }
    if (Date.now() > deadline) throw new Error(`Fixture timed out; see ${output}/server.log`)
    await delay(200)
  }
  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, serviceWorkers: 'block' })
  await context.route('**/*', route => {
    const request = route.request()
    const target = new URL(request.url())
    if (target.origin !== origin || !['GET', 'HEAD'].includes(request.method())
      || target.pathname.startsWith('/api/')) return route.abort()
    return route.continue()
  })
  await context.routeWebSocket('**/*', socket => {
    if (new URL(socket.url()).host === new URL(origin).host) socket.connectToServer()
    else socket.close()
  })
  const page = await context.newPage()
  page.setDefaultTimeout(10_000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const indicator = page.locator('.debug-save')
  const prompt = page.getByRole('dialog', { name: 'Save debug data', exact: true })
  const input = prompt.getByRole('textbox', { name: 'Session ID suffix', exact: true })
  const respond = () => page.getByRole('button', { name: 'Respond', exact: true }).click()
  const waitState = state => page.locator(`.debug-save.${state}`).waitFor()
  const reset = async (query = '') => {
    await page.goto(`${origin}/dev${query}`)
    await indicator.waitFor({ timeout: 60_000 })
  }

  await reset()
  await waitState('off')
  const bounds = await indicator.boundingBox()
  const tutorialBounds = await page.getByRole('button', { name: 'Tutorial', exact: true }).boundingBox()
  assert.ok(bounds.x + bounds.width < tutorialBounds.x, 'The indicator is immediately left of Tutorial')
  await page.mouse.move(0, 500)
  assert.equal(await indicator.evaluate(el => getComputedStyle(el).opacity),
    await page.locator('.tutorial-toggle').evaluate(el => getComputedStyle(el).opacity))
  await indicator.click()
  await prompt.waitFor()
  const promptBounds = await prompt.boundingBox()
  const viewport = await page.evaluate(() => ({ width: document.documentElement.clientWidth, height: innerHeight }))
  assert.ok(Math.abs(promptBounds.x + promptBounds.width / 2 - viewport.width / 2) < 20,
    'The session dialog is centered in the available viewport')
  assert.ok(Math.abs(promptBounds.y + promptBounds.height / 2 - viewport.height / 2) < 20)
  assert.match(await input.inputValue(), /^[A-Z2-9]{5}$/)
  assert.equal(await prompt.locator('input').count(), 1, 'The debug prefix is not an editable input')
  await page.screenshot({ path: resolve(output, 'session-prompt.png') })
  await page.keyboard.press('Escape')
  await prompt.waitFor({ state: 'hidden' })
  assert.equal(await page.evaluate(() => window.__debugDatabase.writes.length), 0)
  await respond()

  // Existing IDs are rejected before changing the run or writing any of its events.
  await page.evaluate(() => { window.__debugDatabase.values['debug/meta/debugTAKEN'] = { sentinel: true } })
  await indicator.click()
  await input.fill('TAKEN')
  await prompt.getByRole('button', { name: 'Save', exact: true }).click()
  await prompt.getByRole('alert').waitFor()
  assert.equal(await page.evaluate(() => window.__debugDatabase.writes.length), 0)
  assert.deepEqual(await page.evaluate(() => window.__debugDatabase.values['debug/meta/debugTAKEN']),
    { sentinel: true })

  // A fast acknowledgment still keeps the activation feedback visible for 500 ms.
  await input.fill('XL7CE')
  await page.evaluate(() => {
    window.__saveStarted = performance.now()
    const observer = new MutationObserver(() => {
      if (document.querySelector('.debug-save.on')) {
        window.__saveElapsed = performance.now() - window.__saveStarted
        observer.disconnect()
      }
    })
    observer.observe(document.querySelector('.debug-save'), { attributes: true })
  })
  await prompt.getByRole('button', { name: 'Save', exact: true }).click()
  await waitState('saving')
  assert.match(await indicator.textContent(), /saving/)
  await waitState('on')
  assert.ok(await page.evaluate(() => window.__saveElapsed >= 500), 'Activation lasts at least 500 ms')
  assert.match(await indicator.textContent(), /debugXL7CE/)
  const savedMeta = await page.evaluate(() => window.__debugDatabase.values['debug/meta/debugXL7CE'])
  const build = JSON.parse(process.env.EXPERIMENT_DEPLOYMENT || 'null')
  if (build) {
    assert.equal(savedMeta.version, build.version)
    assert.equal(savedMeta.deploymentId, build.id)
    assert.equal(savedMeta.sha, build.fullSha || build.sha)
  } else {
    assert.equal(savedMeta.version, undefined, 'Local debug has no dataset version despite legacy epoch config')
    assert.equal(savedMeta.deploymentId, undefined)
  }
  assert.equal(new URL(page.url()).searchParams.has('session_id'), false)
  assert.ok(await page.evaluate(() => Object.keys(window.__debugDatabase.values)
    .some(path => path.startsWith('debug/events/debugXL7CE/') && path.includes('fixture:response'))),
  'Events recorded before activation are backfilled')
  await page.mouse.move(0, 500)
  await page.screenshot({ path: resolve(output, 'saving-active.png') })

  // Queued data and even an in-flight background save leave the normal indicator static.
  await page.evaluate(() => { window.__debugDatabase.hold = true })
  await respond()
  await page.waitForFunction(() => window.__debugDatabase.pending.length > 0)
  assert.equal(await indicator.getAttribute('class'), 'debug-save flex items-center gap-1.5 on')
  await page.evaluate(() => window.__debugDatabase.release())

  // Actual write rejection turns it red. Explicit retry waits for a delayed acknowledgment.
  await page.evaluate(() => { window.__debugDatabase.failUpdates = true })
  await respond()
  await waitState('error')
  await page.screenshot({ path: resolve(output, 'saving-error.png') })
  await page.evaluate(() => {
    window.__debugDatabase.failUpdates = false
    window.__debugDatabase.hold = true
  })
  await indicator.click()
  await waitState('saving')
  await page.waitForFunction(() => window.__debugDatabase.pending.length > 0)
  await delay(650)
  await waitState('saving')
  await page.evaluate(() => window.__debugDatabase.release())
  await waitState('on')

  // A background recovery also clears the error without a click or a pending-data state.
  await page.evaluate(() => { window.__debugDatabase.failUpdates = true })
  await respond()
  await waitState('error')
  await page.evaluate(() => { window.__debugDatabase.failUpdates = false })
  await respond()
  await waitState('on')

  await indicator.click()
  const open = page.getByRole('link', { name: 'Open session', exact: false })
  assert.equal(await open.getAttribute('href'), '/data/sessions/debugXL7CE?mode=debug')
  assert.equal(await open.getAttribute('target'), '_blank')
  await page.keyboard.press('Escape')
  await open.waitFor({ state: 'hidden' })
  await indicator.click()
  await page.getByRole('button', { name: 'Stop saving', exact: true }).click()
  await waitState('off')
  const stoppedWrites = await page.evaluate(() => window.__debugDatabase.writes.length)
  await respond()
  await delay(1400)
  assert.equal(await page.evaluate(() => window.__debugDatabase.writes.length), stoppedWrites)
  await indicator.click()
  await waitState('on')
  assert.ok(await page.evaluate(before => window.__debugDatabase.writes.length > before, stoppedWrites))

  const content = await page.locator('.main-content').textContent()
  await page.getByRole('link', { name: 'Preview', exact: true }).click()
  await page.locator('.preview-mode').waitFor()
  await page.locator('.debug-saving.preview').waitFor()
  await page.getByRole('link', { name: 'Preview', exact: true }).and(page.locator('[aria-current="page"]')).waitFor()
  await waitState('on')
  assert.equal(await page.locator('.main-content').textContent(), content)
  await page.screenshot({ path: resolve(output, 'saving-preview.png') })
  await page.getByRole('link', { name: 'Develop', exact: true }).click()
  await page.locator('.preview-mode').waitFor({ state: 'hidden' })
  await page.reload()
  await waitState('off')
  assert.equal(await indicator.textContent(), '')

  // Connection failure before initialization retains the chosen ID for retry.
  await page.evaluate(() => { window.__debugDatabase.failConnection = true })
  await indicator.click()
  await input.fill('RETRY')
  await prompt.getByRole('button', { name: 'Save', exact: true }).click()
  await waitState('error')
  assert.match(await indicator.textContent(), /debugRETRY/)
  await page.evaluate(() => { window.__debugDatabase.failConnection = false })
  await indicator.click()
  await waitState('on')
  assert.ok(await page.evaluate(() => window.__debugDatabase.values['debug/meta/debugRETRY']))

  // Both URL spellings enable saving, including inferred and explicit live-mode inputs.
  for (const query of ['?session_id=provided-session', '?SESSION_ID=provided-upper',
    '?session_id=inferred-live&PROLIFIC_PID=participant&STUDY_ID=study', '?session_id=explicit-live&mode=live',
    '?mode=debug']) {
    await reset(query)
    await waitState('on')
    const modes = await page.evaluate(() => Object.keys(window.__debugDatabase.values).map(path => path.split('/')[0]))
    assert.ok(modes.length > 0 && modes.every(mode => mode === 'debug'), query)
    const id = new URL(page.url()).searchParams.get('session_id') ?? new URL(page.url()).searchParams.get('SESSION_ID')
    if (id) assert.match(await indicator.textContent(), new RegExp(id))
  }
  assert.deepEqual(errors, [])
  await writeFile(resolve(output, 'result.json'), JSON.stringify({ errors, checks: ['placement', 'gray off state',
    'fixed prefix and generated suffix', 'cancel', 'collision rejection', 'initial event backfill', '500ms minimum',
    'static pending state', 'write failure', 'delayed acknowledgment', 'background recovery', 'session link',
    'stop and resume', 'Preview continuity', 'reload resets', 'initial connection retry', 'URL initialization',
    'inferred and explicit live-mode guards'] }, null, 2) + '\n')
  console.log(`Debug saving checks passed; evidence: ${output}`)
} finally {
  await browser?.close()
  if (server.exitCode === null) {
    server.kill('SIGTERM')
    await new Promise(resolve => server.once('exit', resolve))
  }
  log.end()
}
