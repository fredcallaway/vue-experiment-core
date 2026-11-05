import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { testUrl } from './browser.mjs'

// An optional existing local example URL avoids starting a fixture server.
const project = fileURLToPath(new URL('../../', import.meta.url))
const output = resolve(process.argv[3] ?? '.experiment-tests/audio')
await mkdir(output, { recursive: true })
let server, browser, log
try {
  let input = process.argv[2]
  if (!input) {
    const reservation = createServer()
    await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve))
    const port = reservation.address().port
    await new Promise(resolve => reservation.close(resolve))
    input = `http://127.0.0.1:${port}/examples/audio`
    log = createWriteStream(resolve(output, 'server.log'))
    server = spawn(process.execPath, [resolve(project, 'node_modules/nuxt/bin/nuxt.mjs'),
      'dev', resolve(project, 'core/testing/fixtures/outline'), '--host', '127.0.0.1', '--port', String(port)],
    { cwd: project, stdio: ['ignore', 'pipe', 'pipe'] })
    server.stdout.pipe(log)
    server.stderr.pipe(log)
  }
  const url = testUrl(input, { seed: 'audio-integration' })
  const origin = new URL(url).origin
  const deadline = Date.now() + 90_000
  while (true) {
    if (server?.exitCode != null) throw new Error(`Fixture exited; see ${output}/server.log`)
    try { if ((await fetch(url, { signal: AbortSignal.timeout(2000) })).ok) break } catch { /* Starting. */ }
    if (Date.now() > deadline) throw new Error(`Audio example unavailable; see ${output}/server.log`)
    await delay(200)
  }

  browser = await chromium.launch({ headless: true,
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] })
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 },
    permissions: ['microphone'], serviceWorkers: 'block' })
  const blocked = [], errors = []
  await context.route('**/*', route => {
    const request = route.request()
    if (new URL(request.url()).origin === origin && ['GET', 'HEAD'].includes(request.method())) {
      return route.continue()
    }
    blocked.push(request.url())
    return route.abort('blockedbyclient')
  })
  await context.routeWebSocket('**/*', socket => {
    if (new URL(socket.url()).host === new URL(origin).host) socket.connectToServer()
    else socket.close()
  })
  await context.addInitScript(() => {
    const probe = window.__audioProbe = { streams: [], revoked: [], events: [], deny: false, hold: false }
    const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    navigator.mediaDevices.getUserMedia = async constraints => {
      if (probe.deny) {
        probe.deny = false
        throw new DOMException('Permission denied in test.', 'NotAllowedError')
      }
      if (probe.hold) await new Promise(resolve => { probe.grant = resolve })
      const stream = await getUserMedia(constraints)
      probe.streams.push(stream)
      return stream
    }
    const revoke = URL.revokeObjectURL.bind(URL)
    URL.revokeObjectURL = url => { probe.revoked.push(url); revoke(url) }
    const debug = console.debug.bind(console)
    console.debug = (...args) => {
      if (args[0] === 'logEvent') probe.events.push({ type: args[1], data: structuredClone(args[2]) })
      debug(...args)
    }
  })
  const page = await context.newPage()
  page.setDefaultTimeout(10_000)
  page.on('pageerror', error => errors.push(error.message))
  const button = name => page.getByRole('button', { name, exact: true })
  const open = async () => {
    await page.goto(url)
    await button('Start recording').waitFor({ timeout: 60_000 })
  }
  const tracksStopped = () => page.evaluate(() => window.__audioProbe.streams
    .every(stream => stream.getTracks().every(track => track.readyState === 'ended')))
  await open()
  await page.evaluate(() => { window.__audioProbe.deny = true })
  await button('Start recording').click()
  await page.getByText('Permission denied in test.', { exact: true }).first().waitFor()
  await button('Start recording').click()
  await page.getByText('Recording. Speak now.', { exact: true }).waitFor()
  await delay(700)
  await button('Stop recording').click()
  await page.waitForFunction(() => document.querySelector('audio')?.readyState > 0)
  const recorded = await page.locator('audio').evaluate(async audio => {
    const blob = await (await fetch(audio.src)).blob()
    await audio.play()
    const playing = !audio.paused && !audio.error
    audio.pause()
    return { bytes: blob.size, type: blob.type, playing, url: audio.src }
  })
  assert.ok(recorded.bytes > 0 && recorded.type.startsWith('audio/') && recorded.playing)
  assert.equal(await tracksStopped(), true)
  await page.screenshot({ path: resolve(output, 'playback.png') })
  await button('Finish local preview').click()
  await page.getByText('Local preview only. No file was uploaded.', { exact: true }).waitFor()
  const events = await page.evaluate(() => window.__audioProbe.events.filter(event =>
    event.type.startsWith('audioExample.')))
  assert.deepEqual(events.map(event => event.type),
    ['audioExample.started', 'audioExample.recorded', 'audioExample.saved'])
  assert.equal(events[1].data.bytes, recorded.bytes)
  assert.deepEqual(events[2].data, { saved: false, path: null })
  await button('Continue').click()
  await page.getByText('Finished. The audioExample data view contains', { exact: false }).waitFor()
  assert.ok(await page.evaluate(url => window.__audioProbe.revoked.includes(url), recorded.url))

  // Client-side navigation must dispose the recorder without destroying our probes.
  await open()
  await button('Start recording').click()
  await page.getByText('Recording. Speak now.', { exact: true }).waitFor()
  await page.getByRole('link', { name: 'Examples', exact: true }).click()
  await page.waitForURL('**/examples')
  assert.equal(await tracksStopped(), true)
  await open()
  await page.evaluate(() => { window.__audioProbe.hold = true })
  await button('Start recording').click()
  await page.getByText('Waiting for microphone permission…', { exact: true }).waitFor()
  await page.getByRole('link', { name: 'Examples', exact: true }).click()
  await page.waitForURL('**/examples')
  await page.evaluate(() => window.__audioProbe.grant())
  await page.waitForFunction(() => window.__audioProbe.streams.length === 1
    && window.__audioProbe.streams[0].getTracks().every(track => track.readyState === 'ended'))
  assert.equal(blocked.some(url => /firebaseio|firebasestorage|identitytoolkit|securetoken/.test(url)), false)
  assert.deepEqual(errors, [])
  await writeFile(resolve(output, 'result.json'), JSON.stringify({ recorded, events, errors,
    checks: ['permission retry', 'real recording and playback', 'local save result', 'playback URL cleanup',
      'navigation cleanup', 'late permission cleanup', 'no Firebase requests'] }, null, 2) + '\n')
  console.log(`Audio browser checks passed; evidence: ${output}`)
} finally {
  await browser?.close()
  if (server && server.exitCode === null) {
    server.kill('SIGTERM')
    await new Promise(resolve => server.once('exit', resolve))
  }
  log?.end()
}
