import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { createServer as reservePort } from 'node:net'
import { extname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium } from 'playwright'

const root = fileURLToPath(new URL('../../', import.meta.url))
const fixture = resolve(root, 'core/testing/fixtures/fatal-errors')
const production = process.argv.includes('--production')
const mode = production ? 'production' : 'development'
const output = resolve(root, `.experiment-tests/fatal-errors/${mode}`)
const deployment = { id: 'synthetic-fatal-build', version: 'audit', sha: 'aaaaaaaa', fullSha: 'a'.repeat(40) }
await mkdir(output, { recursive: true })
let processServer, staticServer, browser, log
const checks = []
try {
  let origin
  if (production) {
    log = createWriteStream(resolve(output, 'build.log'))
    const build = spawn(process.execPath, [resolve(root, 'node_modules/nuxt/bin/nuxt.mjs'),
      'generate', fixture, '--envName', 'deployment'], {
      cwd: root, env: { ...process.env, EXPERIMENT_DEPLOYMENT: JSON.stringify(deployment) },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    build.stdout.pipe(log)
    build.stderr.pipe(log)
    assert.equal(await new Promise(resolve => build.once('exit', resolve)), 0, `See ${output}/build.log`)
    const publicDir = resolve(fixture, '.output/public')
    const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json' }
    staticServer = createServer(async (request, response) => {
      const path = resolve(publicDir, `.${new URL(request.url, 'http://fixture.invalid').pathname}`)
      if (relative(publicDir, path).startsWith('..')) return void response.writeHead(400).end()
      try {
        const body = await readFile(path)
        response.setHeader('Content-Type', types[extname(path)] || 'application/octet-stream')
        response.end(body)
      } catch {
        response.setHeader('Content-Type', 'text/html')
        response.end(await readFile(resolve(publicDir, 'index.html')))
      }
    })
    await new Promise(resolve => staticServer.listen(0, '127.0.0.1', resolve))
    origin = `http://127.0.0.1:${staticServer.address().port}`
  } else {
    const reservation = reservePort()
    await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve))
    const port = reservation.address().port
    await new Promise(resolve => reservation.close(resolve))
    origin = `http://127.0.0.1:${port}`
    log = createWriteStream(resolve(output, 'server.log'))
    processServer = spawn(process.execPath, [resolve(root, 'node_modules/nuxt/bin/nuxt.mjs'),
      'dev', fixture, '--host', '127.0.0.1', '--port', String(port)], {
      cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
    })
    processServer.stdout.pipe(log)
    processServer.stderr.pipe(log)
    const deadline = Date.now() + 90_000
    while (true) {
      if (processServer.exitCode !== null) throw new Error(`Fixture exited; see ${output}/server.log`)
      try { if ((await fetch(origin, { signal: AbortSignal.timeout(2000) })).ok) break } catch { /* Starting. */ }
      if (Date.now() > deadline) throw new Error(`Fixture timed out; see ${output}/server.log`)
      await delay(200)
    }
  }

  browser = await chromium.launch({ headless: true })
  async function visit(path, { narrow = false, clipboardFails = false } = {}) {
    const context = await browser.newContext({ serviceWorkers: 'block',
      viewport: narrow ? { width: 390, height: 844 } : { width: 1280, height: 900 } })
    await context.route('**/*', route => {
      const request = route.request(), url = new URL(request.url())
      return url.origin === origin && ['GET', 'HEAD'].includes(request.method()) && !url.pathname.startsWith('/api/')
        ? route.continue() : route.abort()
    })
    await context.routeWebSocket('**/*', socket => {
      if (!production && new URL(socket.url()).host === new URL(origin).host) socket.connectToServer()
      else socket.close()
    })
    if (clipboardFails) {
      await context.addInitScript(() => Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: async () => { throw new Error('Synthetic clipboard denial') } },
      }))
    } else await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin })
    const page = await context.newPage()
    page.setDefaultTimeout(15_000)
    await page.goto(origin + path)
    return { page, context }
  }

  const cases = [
    ['plugin', '/dev?fault=plugin&token=synthetic-private', 'Synthetic startup plugin failed', 'Original startup cause'],
    ['config', '/dev?fault=config', 'Epoch config not initialized'],
    ['session', '/dev?session_id=_meta&testing=1', 'session_id cannot be _meta'],
    ['guard', '/exp?fault=guard&PROLIFIC_PID=111111111111111111111111&STUDY_ID=222222222222222222222222',
      'Live sessions require a tracked deployment'],
    ['page', '/examples/fatal?token=synthetic-private', 'Synthetic page setup failed', 'Original page cause'],
  ]
  for (const [name, path, message, cause] of cases) {
    const { page, context } = await visit(path)
    try {
      await page.getByRole('heading', { name: 'This page could not load', exact: true }).waitFor({ timeout: 60_000 })
      const details = page.locator('details')
      assert.equal(await details.getAttribute('open'), null)
      await page.getByText('Technical details', { exact: true }).click()
      const report = await page.getByRole('textbox', { name: 'Error report', exact: true }).inputValue()
      assert.ok(report.includes(message), `${name}: original message survives`)
      if (cause) assert.ok(report.includes(cause), `${name}: original cause survives`)
      assert.ok(!report.includes('synthetic-private'))
      if (production && name !== 'guard') assert.ok(report.includes(deployment.fullSha), 'Embedded build is available')
      const copy = page.getByRole('button', { name: 'Copy report', exact: true })
      const bounds = await copy.boundingBox()
      await copy.click()
      await page.getByRole('status').getByText('Report copied.', { exact: true }).waitFor()
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), report)
      assert.deepEqual(await copy.boundingBox(), bounds)
      assert.equal(await page.evaluate(() => window.__debugDatabase?.writes.length ?? 0), 0)
      await page.screenshot({ path: resolve(output, `${name}.png`) })
      checks.push(`${name}: readable fallback, original diagnostics, copy, stable control, no database writes`)
    } finally { await context.close() }
  }

  const fallback = await visit('/dev?fault=config', { narrow: true, clipboardFails: true })
  try {
    const { page } = fallback
    await page.getByRole('heading', { name: 'This page could not load' }).waitFor()
    await page.getByRole('button', { name: 'Copy report' }).click()
    const report = page.getByRole('textbox', { name: 'Error report' })
    await report.waitFor()
    assert.equal(await report.evaluate(el => document.activeElement === el && el.selectionEnd === el.value.length), true)
    assert.match(await page.getByRole('status').innerText(), /Select and copy/)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    await page.screenshot({ path: resolve(output, 'clipboard-fallback-narrow.png') })
    checks.push('Clipboard denial opens and selects report on a narrow screen without horizontal overflow')
  } finally { await fallback.context.close() }

  const healthy = await visit('/dev?testing=1&preview=1')
  try {
    await healthy.page.getByRole('heading', { name: 'Fatal error fixture', exact: true }).waitFor()
    await healthy.page.getByRole('button', { name: 'Respond', exact: true }).click()
    await healthy.page.getByText('Responses: 1', { exact: true }).waitFor()
    assert.equal(await healthy.page.locator('.fatal-error').count(), 0)
    assert.equal(await healthy.page.evaluate(() => window.__debugDatabase?.writes.length ?? 0), 0)
    checks.push('Healthy experiment still accepts input without initializing persistence')
  } finally { await healthy.context.close() }
  await writeFile(resolve(output, 'result.json'), JSON.stringify({ mode, checks }, null, 2) + '\n')
  console.log(`${checks.length} ${mode} fatal-error integration checks passed; evidence: ${output}`)
} finally {
  await browser?.close()
  if (staticServer) await new Promise(resolve => staticServer.close(resolve))
  if (processServer?.exitCode === null) {
    processServer.kill('SIGTERM')
    await new Promise(resolve => processServer.once('exit', resolve))
  }
  log?.end()
  if (production) {
    for (const path of ['.nuxt/production', '.output', 'dist']) {
      await rm(resolve(fixture, path), { recursive: true, force: true })
    }
  }
}
