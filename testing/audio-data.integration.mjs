import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const project = fileURLToPath(new URL('../../', import.meta.url))
const output = resolve('.experiment-tests/audio-data')
await mkdir(output, { recursive: true })
const reservation = createServer()
await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve))
const port = reservation.address().port
await new Promise(resolve => reservation.close(resolve))
const origin = `http://127.0.0.1:${port}`
const log = createWriteStream(resolve(output, 'server.log'))
const server = spawn(process.execPath, [resolve(project, 'node_modules/nuxt/bin/nuxt.mjs'),
  'dev', resolve(project, 'core/testing/fixtures/audio-data'), '--host', '127.0.0.1', '--port', String(port)],
{ cwd: project, stdio: ['ignore', 'pipe', 'pipe'] })
server.stdout.pipe(log)
server.stderr.pipe(log)

// A short PCM WAV exercises the real browser decoder without a microphone or participant data.
const wav = Buffer.alloc(8044)
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8)
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22)
wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32)
wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40)
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
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
  let failNext = true
  let failNextSync = false
  let releaseAudio
  let holdNextAudio = false
  const requests = [], errors = [], exports = [], syncs = []
  await context.route('**/*', async route => {
    const request = route.request()
    const target = new URL(request.url())
    if (target.origin !== origin) return route.abort()
    if (target.pathname === '/api/syncData' && request.method() === 'POST') {
      syncs.push(request.postDataJSON())
      if (failNextSync) {
        failNextSync = false
        return route.fulfill({ json: { numUpdated: 0, numError: 1 } })
      }
      return route.fulfill({ json: { numUpdated: 1, numError: 0 } })
    }
    if (target.pathname.startsWith('/api/data/processed/') && request.method() === 'POST') {
      exports.push({ path: target.pathname, data: JSON.parse(request.postData()) })
      return route.fulfill({ json: null })
    }
    if (!['GET', 'HEAD'].includes(request.method())) return route.abort()
    if (target.pathname === '/api/recordings') {
      requests.push(Object.fromEntries(target.searchParams))
      if (holdNextAudio) {
        holdNextAudio = false
        await new Promise(resolve => { releaseAudio = resolve })
      }
      if (failNext) {
        failNext = false
        return route.fulfill({ status: 403, json: { message: 'The project service account needs Storage Object Viewer.' } })
      }
      return route.fulfill({ contentType: 'audio/wav', body: wav })
    }
    // No test may reach the production filesystem-backed data API.
    if (target.pathname.startsWith('/api/data/') || target.pathname === '/api/syncData') {
      throw new Error('The isolated session fixture unexpectedly accessed the data API.')
    }
    return route.continue()
  })
  await context.routeWebSocket('**/*', socket => {
    if (new URL(socket.url()).host === new URL(origin).host) socket.connectToServer()
    else socket.close()
  })
  await context.addInitScript(() => {
    window.__revokedAudio = []
    const revoke = URL.revokeObjectURL.bind(URL)
    URL.revokeObjectURL = url => { window.__revokedAudio.push(url); revoke(url) }
  })
  const page = await context.newPage()
  // Exercise the real Nuxt endpoint before mocking file bytes for the UI checks below.
  const endpoint = `${origin}/api/recordings?bucket=audio-fixture.invalid`
  assert.equal((await fetch(endpoint)).status, 400, 'The local Nuxt request must reach parameter validation')
  assert.equal((await fetch(endpoint, { headers: { Origin: 'https://other.invalid' } })).status, 403)
  page.setDefaultTimeout(10_000)
  page.on('pageerror', error => errors.push(error.message))
  const audioTab = () => page.getByRole('button', { name: 'audio', exact: true })
  const list = () => page.getByRole('region', { name: 'Recorded audio', exact: true })
  const geometry = () => list().evaluate(region => ({
    rows: [...region.querySelectorAll('[data-recording-path]')].map(row => {
      const { x, y, width, height } = row.getBoundingClientRect()
      return { x, y, width, height }
    }),
    scrollY: window.scrollY,
    scrollTop: region.querySelector('ul').scrollTop,
  }))
  await page.goto(`${origin}/data/sessions/audio-session-1`)
  await audioTab().waitFor({ timeout: 60_000 })
  assert.equal(requests.length, 0, 'opening session data does not download recordings')
  await audioTab().click()
  await list().scrollIntoViewIfNeeded()
  const initialGeometry = await geometry()
  holdNextAudio = true
  await list().getByRole('button', { name: 'Play clip one.wav', exact: true }).click()
  await list().getByRole('button', { name: 'Stop clip one.wav', exact: true }).waitFor()
  assert.deepEqual(await geometry(), initialGeometry, 'Loading must preserve row geometry and scroll position')
  releaseAudio()
  await list().getByRole('alert').filter({ hasText: 'Storage Object Viewer' }).waitFor({ state: 'attached' })
  assert.deepEqual(await geometry(), initialGeometry, 'Errors must preserve row geometry and scroll position')
  await list().getByRole('button', { name: 'Retry clip one.wav', exact: true }).focus()
  await page.keyboard.press('Enter')
  await page.waitForFunction(() => document.querySelector('audio')?.readyState > 0)
  const player = list().locator('audio')
  assert.deepEqual(await geometry(), initialGeometry, 'Playback must preserve row geometry and scroll position')
  assert.equal(await player.evaluate(audio => audio.closest('li')?.dataset.recordingPath),
    'sessions/uid/audio-session-1/clip%20one.wav')
  assert.equal(await list().getByRole('button', { name: 'Stop clip one.wav', exact: true })
    .evaluate(button => document.activeElement === button), true)
  assert.equal(await player.evaluate(audio => audio.duration), 0.5)
  assert.equal(await player.evaluate(audio => audio.controls), false)
  const firstUrl = await player.getAttribute('src')
  await page.screenshot({ path: resolve(output, 'session-audio.png') })
  await list().getByRole('button', { name: 'Stop clip one.wav', exact: true }).click()
  assert.ok(await page.evaluate(url => window.__revokedAudio.includes(url), firstUrl))
  await list().getByRole('button', { name: 'Play clip one.wav', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('audio')?.readyState > 0)
  const secondUrl = await player.getAttribute('src')
  await page.getByRole('button', { name: 'events', exact: true }).click()
  assert.ok(await page.evaluate(url => window.__revokedAudio.includes(url), secondUrl))
  await page.goto(`${origin}/data/versions/audio-test`)
  await audioTab().waitFor()
  await audioTab().click()
  await list().getByRole('button', { name: 'Play clip one.wav', exact: true }).waitFor()
  await list().scrollIntoViewIfNeeded()
  const versionGeometry = await geometry()
  await list().getByRole('button', { name: 'Play legacy.wav', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('audio')?.readyState > 0)
  assert.deepEqual(await geometry(), versionGeometry, 'Selecting another row must not move its neighbors')
  await page.setViewportSize({ width: 900, height: 800 })
  await list().scrollIntoViewIfNeeded()
  const narrowGeometry = await geometry()
  await list().getByRole('button', { name: 'Play clip one.wav', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('audio')?.readyState > 0)
  assert.deepEqual(await geometry(), narrowGeometry, 'Narrow layouts retain row geometry during playback')
  await list().getByRole('button', { name: 'Play legacy.wav', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('audio')?.readyState > 0)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await list().getByRole('textbox').fill('audio-session-2')
  await list().getByRole('button', { name: 'Play clip one.wav', exact: true }).waitFor({ state: 'hidden' })
  assert.equal(await list().locator('[data-recording-path]').count(), 1)
  await page.screenshot({ path: resolve(output, 'version-audio.png') })
  assert.equal(requests.at(-1).path, 'word-naming/p2/audio-session-2/legacy.wav')
  assert.equal(requests.every(request => request.bucket === 'audio-fixture.invalid'), true)

  await page.getByRole('button', { name: 'trial', exact: true }).click()
  const cellPlay = page.locator('td').getByRole('button', { name: 'Play clip one.wav', exact: true })
  const cellStop = page.locator('td').getByRole('button', { name: 'Stop clip one.wav', exact: true })
  const row = page.locator('tbody tr').filter({ hasText: 'audio-session-1' })
  const rowHeight = (await row.boundingBox()).height
  await cellPlay.click()
  await page.waitForFunction(() => document.querySelector('td audio')?.readyState > 0)
  assert.equal((await row.boundingBox()).height, rowHeight, 'Audio cells preserve the height of their trial row')
  assert.equal(await page.locator('td audio[controls]').count(), 0)
  await cellStop.click()
  await cellPlay.waitFor()
  await page.screenshot({ path: resolve(output, 'audio-cell.png') })

  await page.getByRole('button', { name: 'save', exact: true }).click()
  await page.getByText('was last updated at', { exact: false }).waitFor()
  assert.deepEqual(syncs, [{ mode: 'live', includeAudio: true, version: 'audio-test' }])
  const relative = '../../../raw/live/audio/sessions/uid/audio-session-1/clip%20one.wav'
  assert.equal(exports.find(file => file.path.endsWith('/trial.csv')).data[0].audio, relative)
  assert.equal(exports.find(file => file.path.endsWith('/details.json')).data['audio-session-1'].audio, relative)
  syncs.length = 0
  exports.length = 0

  await page.goto(`${origin}/data?mode=debug`)
  await page.getByRole('heading', { name: 'Debug sessions', exact: true }).waitFor()
  await page.waitForURL('**/data/sessions?mode=debug')
  assert.equal(await page.getByRole('button', { name: 'versions', exact: true }).count(), 0)
  assert.deepEqual(await page.locator('tbody tr a').filter({ hasText: /^debug-/ }).allTextContents(),
    ['debug-hosted-new', 'debug-local', 'debug-hosted-old'], 'Debug sessions are newest first across versions')
  assert.equal(await page.locator('thead').getByText('version', { exact: true }).count(), 0)
  await page.screenshot({ path: resolve(output, 'debug-sessions.png') })
  await page.getByRole('link', { name: 'debug-local', exact: true }).click()
  await page.getByRole('button', { name: 'save', exact: true }).waitFor()
  assert.equal(new URL(page.url()).searchParams.get('mode'), 'debug')
  await page.getByRole('button', { name: 'save', exact: true }).click()
  await page.getByText('saved at', { exact: false }).waitFor()
  assert.deepEqual(syncs, [{ mode: 'debug', sessionId: 'debug-local', includeAudio: true }])
  assert.equal(exports.length, 4)
  assert.ok(exports.every(file => file.path.startsWith('/api/data/processed/debug/debug-local/')))
  assert.equal(exports.find(file => file.path.endsWith('/_session.json')).data.meta.sessionId, 'debug-local')
  assert.deepEqual(exports.find(file => file.path.endsWith('/trial.csv')).data,
    [{ session_id: 'debug-local', response: 'fixture',
      audio: '../../../raw/debug/audio/sessions/uid/audio-session-1/clip%20one.wav' }])
  assert.equal(exports.find(file => file.path.endsWith('/details.json')).data.audio,
    '../../../raw/debug/audio/sessions/uid/audio-session-1/clip%20one.wav')
  assert.equal(exports.find(file => file.path.endsWith('/empty.json')).data, null)
  await page.screenshot({ path: resolve(output, 'debug-session-export.png') })
  await page.goto(`${origin}/data/versions/old-pilot?mode=debug`)
  await page.waitForURL('**/data/sessions?mode=debug')
  assert.equal(exports.length, 4, 'Old debug version links do not export or combine sessions')
  await page.goto(`${origin}/data/sessions/debug-hosted-new?mode=debug`)
  failNextSync = true
  await page.getByRole('button', { name: 'save', exact: true }).click()
  await page.getByText('Could not refresh this session. Retry before exporting.', { exact: true }).waitFor()
  assert.equal(exports.length, 4, 'A failed session refresh cannot export stale data')
  await page.getByRole('button', { name: 'save', exact: true }).click()
  await page.getByText('saved at', { exact: false }).waitFor()
  assert.ok(exports.slice(4).every(file => file.path.startsWith('/api/data/processed/debug/debug-hosted-new/')))
  assert.equal(await page.getByRole('link', { name: 'new-pilot', exact: true }).count(), 0)
  assert.deepEqual(errors, [])
  await writeFile(resolve(output, 'result.json'), JSON.stringify({ requests, errors,
    checks: ['session playback', 'permission error and retry', 'no eager downloads', 'cleanup on tab change',
      'version playback', 'legacy recording paths', 'session filtering', 'inline player',
      'fixed row geometry during loading, error, retry, and playback', 'keyboard playback', 'narrow row geometry'] }, null, 2) + '\n')
  console.log(`Data-page audio checks passed; evidence: ${output}`)
} finally {
  await browser?.close()
  if (server.exitCode === null) {
    server.kill('SIGTERM')
    await new Promise(resolve => server.once('exit', resolve))
  }
  log.end()
}
