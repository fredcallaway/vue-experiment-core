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
  const requests = [], errors = []
  await context.route('**/*', route => {
    const request = route.request()
    const target = new URL(request.url())
    if (target.origin !== origin || !['GET', 'HEAD'].includes(request.method())) return route.abort()
    if (target.pathname === '/api/recordings') {
      requests.push(Object.fromEntries(target.searchParams))
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
  await page.goto(`${origin}/data/sessions/audio-session-1`)
  await audioTab().waitFor({ timeout: 60_000 })
  assert.equal(requests.length, 0, 'opening session data does not download recordings')
  await audioTab().click()
  await list().getByRole('button', { name: 'Play clip one.wav', exact: true }).click()
  await list().getByRole('alert').filter({ hasText: 'Storage Object Viewer' }).waitFor()
  await list().getByRole('button', { name: 'Retry', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('audio')?.readyState > 0)
  const player = list().locator('audio')
  assert.equal(await player.evaluate(audio => audio.duration), 0.5)
  const firstUrl = await player.getAttribute('src')
  await player.evaluate(async audio => { await audio.play(); audio.pause() })
  await page.screenshot({ path: resolve(output, 'session-audio.png') })
  await page.getByRole('button', { name: 'events', exact: true }).click()
  assert.ok(await page.evaluate(url => window.__revokedAudio.includes(url), firstUrl))
  await page.goto(`${origin}/data/versions/audio-test`)
  await audioTab().waitFor()
  await audioTab().click()
  await list().getByRole('button', { name: 'Play clip one.wav', exact: true }).waitFor()
  await list().getByRole('button', { name: 'Play legacy.wav', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('audio')?.readyState > 0)
  await list().getByRole('textbox').fill('audio-session-2')
  await list().getByRole('button', { name: 'Play clip one.wav', exact: true }).waitFor({ state: 'hidden' })
  assert.equal(await list().getByRole('button', { name: 'Play legacy.wav', exact: true }).count(), 1)
  await page.screenshot({ path: resolve(output, 'version-audio.png') })
  assert.equal(requests.at(-1).path, 'word-naming/p2/audio-session-2/legacy.wav')
  assert.equal(requests.every(request => request.bucket === 'audio-fixture.invalid'), true)
  assert.deepEqual(errors, [])
  await writeFile(resolve(output, 'result.json'), JSON.stringify({ requests, errors,
    checks: ['session playback', 'permission error and retry', 'no eager downloads', 'cleanup on tab change',
      'version playback', 'legacy recording paths', 'session filtering'] }, null, 2) + '\n')
  console.log(`Data-page audio checks passed; evidence: ${output}`)
} finally {
  await browser?.close()
  if (server.exitCode === null) {
    server.kill('SIGTERM')
    await new Promise(resolve => server.once('exit', resolve))
  }
  log.end()
}
