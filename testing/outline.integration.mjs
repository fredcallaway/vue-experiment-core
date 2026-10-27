import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { safeBrowser } from './browser.mjs'

// A separate Nuxt app keeps regression epochs out of the researcher's real experiment.
const core = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const project = resolve(core, '..')
const fixture = resolve(core, 'testing/fixtures/outline')
const output = resolve(process.argv[2] ?? '.experiment-tests/outline')
await mkdir(output, { recursive: true })
const reservation = createServer()
await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve))
const port = reservation.address().port
await new Promise(resolve => reservation.close(resolve))
const origin = `http://127.0.0.1:${port}`
const log = createWriteStream(resolve(output, 'server.log'))
const server = spawn(process.execPath, [resolve(project, 'node_modules/nuxt/bin/nuxt.mjs'),
  'dev', fixture, '--host', '127.0.0.1', '--port', String(port)], {
  cwd: project, stdio: ['ignore', 'pipe', 'pipe'],
})
server.stdout.pipe(log)
server.stderr.pipe(log)
let browser
const checkpoints = []
try {
  const deadline = Date.now() + 90_000
  while (true) {
    if (server.exitCode !== null) throw new Error(`Fixture server exited ${server.exitCode}; see ${output}/server.log`)
    try {
      if ((await fetch(`${origin}/dev`, { signal: AbortSignal.timeout(2000) })).ok) break
    } catch { /* Nuxt has not finished starting. */ }
    if (Date.now() > deadline) throw new Error(`Fixture server did not become ready; see ${output}/server.log`)
    await delay(200)
  }

  // Warm Vite's dependency optimizer before the clean browser-error assertions below.
  const warmup = await safeBrowser({ url: `${origin}/dev` })
  try {
    await warmup.page.goto(warmup.url)
    await warmup.page.waitForFunction(() => window.__experimentTest?.snapshot().epoch?.endsWith('-opening'),
      null, { timeout: 60_000 })
    await warmup.page.waitForFunction(() => localStorage.getItem('epoch-outline:/dev') !== null,
      null, { timeout: 30_000 })
    await delay(500)
  } finally { await warmup.close() }

  for (const mode of ['develop', 'preview']) {
    browser = await safeBrowser({ url: `${origin}/dev`, viewport: { width: 1600, height: 1000 },
      seed: `outline-${mode}` })
    const { page } = browser
    const url = new URL(browser.url)
    url.searchParams.set('preview', mode === 'preview' ? '1' : '0')
    await page.goto(url.href)
    const epoch = async expected => {
      await page.waitForFunction(target => window.__experimentTest?.snapshot().epoch === target, expected)
    }
    const opening = 'fixture[0]-nested[0]-opening'
    const blocks = 'fixture[0]-nested[1]-blocks'
    const block = `${blocks}[0]-block`
    const trials = `${block}[1]-trials`
    const trial = `${trials}[0]-trial`
    const choice = `${trial}[0]-choice`
    const feedback = `${trial}[1]-feedback`
    const phases = 'fixture[1]-phases'
    const apples = `${phases}[apple]-apple-applePages`
    const red = `${apples}[0]-red`
    const green = `${apples}[1]-green`
    const banana = `${phases}[banana]-banana`
    const asyncEpoch = 'fixture[3]-async'
    const frame = page.locator('.main-content')
    const participant = name => frame.getByRole('button', { name, exact: true })
    const outline = async () => {
      if (mode === 'preview') {
        const trigger = page.getByRole('button', { name: 'Outline', exact: true })
        if (await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click()
        return page.getByRole('region', { name: 'Experiment outline' })
      }
      return page.locator('.experiment-workspace')
    }
    const row = async id => (await outline()).locator(`[data-epoch-id="${id}"]`)
    const jump = async (id, target = id) => {
      const targetRow = await row(id)
      await targetRow.locator('.truncate').click()
      await epoch(target)
    }
    const capture = async name => {
      if (mode === 'preview') {
        await page.getByRole('button', { name: 'Outline', exact: true }).hover()
        await page.getByRole('region', { name: 'Experiment outline' }).waitFor()
        await page.waitForFunction(() => getComputedStyle(document.getElementById('preview-outline-panel'))
          .opacity === '1')
      }
      await page.screenshot({ path: resolve(output, `${mode}-${name}.png`) })
      const state = await browser.readState()
      checkpoints.push({ mode, name, epoch: state.epoch, eventCount: state.events.length })
    }
    await epoch(opening)
    await page.waitForFunction(() => {
      const cached = localStorage.getItem('epoch-outline:/dev')
      return cached && JSON.parse(cached).root.children.length === 5
    }, null, { timeout: 30_000 })
    await outline()
    await (await row(phases)).waitFor()
    assert.equal(await page.locator('iframe[title="outline-worker"]').count(), 1)
    const worker = page.frameLocator('iframe[title="outline-worker"]')
    assert.equal(await worker.getByRole('navigation').count(), 0)
    assert.equal(await worker.locator('iframe').count(), 0, 'The traversal worker cannot recursively spawn')
    assert.equal(await frame.getByTestId('root-count').innerText(), 'Root count: 0',
      'Cold-cache traversal leaves the participant instance untouched')
    assert.equal((await browser.readState()).events.filter(event => event.eventType === 'epoch.start').length, 3,
      'Worker traversal does not append participant-tab epoch starts')
    await participant('Increment root').click()
    await participant('Begin blocks').click()
    await participant('Begin trials').click()
    await epoch(choice)
    await participant('Increment trial').click()
    const trialState = await frame.getByTestId('trial-state').innerText()
    await participant('Show feedback').click()
    await epoch(feedback)
    await jump(trial, choice)
    assert.equal(await frame.getByTestId('trial-state').innerText(), trialState,
      'Restarting an active trial parent preserves its mounted local state')
    await jump(feedback)
    await jump(choice)
    assert.equal(await frame.getByTestId('trial-state').innerText(), trialState,
      'Sibling and leaf jumps do not reset shared ancestors')
    await capture('active-trial-restart')

    // Identical-child badges select repeat indices independently of ancestor restart.
    const innerBadge = (await row(trials)).getByTitle('left/right click or scroll to cycle through steps', { exact: true })
    assert.equal((await innerBadge.innerText()).trim(), '1 / 2')
    await innerBadge.click()
    await epoch(`${trials}[1]-trial[0]-choice`)
    assert.equal(await frame.getByTestId('trial-position').innerText(), 'Block 1, trial 2')
    assert.equal((await (await row(trials)).getByTitle('left/right click or scroll to cycle through steps', { exact: true }).innerText()).trim(), '2 / 2')
    await innerBadge.click({ button: 'right' })
    await epoch(choice)
    await innerBadge.hover()
    await page.mouse.wheel(0, 100)
    await epoch(`${trials}[1]-trial[0]-choice`)
    await jump(trials, choice)
    const outerBadge = (await row(blocks)).getByTitle('left/right click or scroll to cycle through steps', { exact: true })
    await outerBadge.click()
    await epoch(`${blocks}[1]-block[0]-intro`)
    await participant('Begin trials').click()
    assert.equal(await frame.getByTestId('trial-position').innerText(), 'Block 2, trial 1')
    await jump(`${blocks}[1]-block`, `${blocks}[1]-block[0]-intro`)
    await jump(blocks, `${block}[0]-intro`)
    await jump('fixture[0]-nested', opening)
    assert.equal(await frame.getByTestId('root-count').innerText(), 'Root count: 1')
    await capture('nested-repeat-restart')

    await jump(phases, red)
    await participant('Increment phase').click()
    await participant('Next apple').click()
    await epoch(green)
    await jump(apples, red)
    assert.equal(await frame.getByTestId('phase-state').innerText(), 'Phase count: 1')
    await jump(green)
    await participant('Finish apples').click()
    await epoch(banana)
    await frame.getByText('Banana phase', { exact: true }).waitFor()
    await frame.getByTestId('phase-animation').filter({ hasText: 'settled' }).waitFor()
    await jump(phases, red)
    await frame.getByText('Red apple page', { exact: true }).waitFor()
    assert.equal(await frame.getByTestId('phase-state').innerText(), 'Phase count: 1')
    await capture('animated-phase-restart')

    // Interrupt the fade-out before it can finish and overwrite the jumped display.
    await participant('Next apple').click()
    await participant('Finish apples').click()
    await epoch(banana)
    await frame.getByTestId('phase-animation').filter({ hasText: 'out' }).waitFor()
    await jump(phases, red)
    await delay(700)
    await epoch(red)
    assert.equal(await frame.getByText('Red apple page', { exact: true }).isVisible(), true)
    assert.equal(await frame.getByText('Banana phase', { exact: true }).isVisible(), false)
    await capture('interrupted-phase-fade')

    const persistent = 'fixture[2]-persistent'
    const memory = `${persistent}[presentation]-presentation-memory`
    await jump(persistent, memory)
    await participant('Increment memory').click()
    const memoryState = await frame.getByTestId('memory-state').innerText()
    await participant('Show graph').click()
    await epoch(`${persistent}[graph]-graph-graphPage`)
    await frame.getByText('Graph interlude', { exact: true }).waitFor()
    await frame.getByTestId('persistent-animation').filter({ hasText: 'settled' }).waitFor()
    await jump(persistent, memory)
    assert.equal(await frame.getByTestId('memory-state').innerText(), memoryState,
      'A child persisted across phases keeps its mounted local state')
    await capture('persistent-phase-child')

    await jump(asyncEpoch)
    await participant('Schedule completion').click()
    await frame.getByText('Async completion pending', { exact: true }).waitFor()
    await jump('fixture', opening)
    await delay(1500)
    await epoch(opening)
    assert.equal(await frame.getByText('Opening screen', { exact: true }).isVisible(), true,
      'Unmounted async completion cannot advance the restarted ancestor')
    await jump(asyncEpoch)
    await participant('Schedule completion').click()
    await epoch('fixture[4]-finish')
    await frame.getByText('Fixture finished', { exact: true }).waitFor()
    await jump('fixture', opening)
    assert.equal(await frame.getByTestId('root-count').innerText(), 'Root count: 1')
    await capture('async-cancellation-and-root-restart')
    const state = await browser.readState()
    assert.equal(state.writerInitialized, false, 'Fixture never initializes database persistence')
    assert.deepEqual(browser.errors, [], `${mode} navigation produces zero browser errors`)
    assert.deepEqual(state.events.filter(event => /error/i.test(event.eventType)), [],
      `${mode} navigation produces zero experiment error events`)

    // Exercise the error-reporting path only after clean navigation has been established.
    await participant('Log diagnostic').click()
    await page.waitForFunction(() => window.__experimentTest.snapshot().events
      .some(event => event.eventType === 'error' && event.data.message === 'fixture diagnostic'))
    const diagnostic = (await browser.readState()).events.filter(event => event.eventType === 'error')
    assert.equal(diagnostic.length, 1)
    assert.equal(diagnostic[0].data.message, 'fixture diagnostic')
    assert.deepEqual(browser.errors.map(error => error.kind), ['console'])
    assert.match(browser.errors[0].message, /logError fixture diagnostic Error: expected/)
    await browser.close()
    browser = undefined
  }
  await writeFile(resolve(output, 'report.json'), JSON.stringify({ checkpoints }, null, 2))
  console.log(`Passed Develop/Preview: cold worker isolation, active ancestors, nested 2x2 repeats, badges,` +
    ` shared state, named phases, persistent children, interrupted fades, delayed completion cancellation, and zero errors; evidence: ${output}`)
} catch (error) {
  if (browser) {
    await browser.page.screenshot({ path: resolve(output, 'failure.png') }).catch(() => {})
    await writeFile(resolve(output, 'failure.json'), JSON.stringify(await browser.readState(), null, 2))
  }
  throw error
} finally {
  await browser?.close()
  server.kill('SIGTERM')
  await new Promise(resolve => {
    if (server.exitCode !== null) return resolve()
    server.once('exit', resolve)
    const timeout = setTimeout(() => { server.kill('SIGKILL') }, 5000)
    timeout.unref()
  })
  log.end()
}
