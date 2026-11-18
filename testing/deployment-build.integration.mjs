import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { lstat, mkdir, readFile, rm, unlink } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

// Build a real static artifact with synthetic identity and an in-memory database. Never upload it.
const root = fileURLToPath(new URL('../../', import.meta.url))
const fixture = resolve(root, 'core/testing/fixtures/debug-saving')
const output = resolve(root, '.experiment-tests/deployment-build')
const cleanBuild = async () => {
  await Promise.all(['.nuxt/production', '.output'].map(path =>
    rm(resolve(fixture, path), { recursive: true, force: true })))
  const dist = resolve(fixture, 'dist')
  if ((await lstat(dist).catch(() => null))?.isSymbolicLink()) await unlink(dist)
}
await mkdir(output, { recursive: true })
const deployment = { id: 'synthetic-deployment', version: 'pilot-with-instructions',
  sha: 'aaaaaaaa', fullSha: 'a'.repeat(40) }
const log = createWriteStream(resolve(output, 'build.log'))
const build = spawn(process.execPath, [resolve(root, 'node_modules/nuxt/bin/nuxt.mjs'),
  'generate', fixture, '--envName', 'deployment'], {
  cwd: root, env: { ...process.env, EXPERIMENT_DEPLOYMENT: JSON.stringify(deployment) },
  stdio: ['ignore', 'pipe', 'pipe'],
})
build.stdout.pipe(log)
build.stderr.pipe(log)
const exitCode = await new Promise(resolve => build.once('exit', resolve))
if (exitCode !== 0) await cleanBuild()
assert.equal(exitCode, 0, `Build failed; see ${output}/build.log`)
const publicDir = resolve(fixture, '.output/public')
const types = { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.html': 'text/html', '.svg': 'image/svg+xml' }
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://fixture.invalid').pathname
  const path = resolve(publicDir, `.${pathname}`)
  if (relative(publicDir, path).startsWith('..')) { response.writeHead(400).end(); return }
  try {
    const file = pathname === '/' ? resolve(publicDir, 'index.html') : path
    response.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream')
    response.end(await readFile(file))
  } catch {
    response.setHeader('Content-Type', 'text/html')
    response.end(await readFile(resolve(publicDir, 'index.html')))
  }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`
const browser = await chromium.launch({ headless: true })
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
  await context.route('**/*', route => new URL(route.request().url()).origin === origin
    && ['GET', 'HEAD'].includes(route.request().method()) ? route.continue() : route.abort())
  await context.routeWebSocket('**/*', socket => socket.close())
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(origin)
  await page.getByText("If you're here to do an experiment, you have the wrong link.", { exact: true }).waitFor()
  assert.equal(new URL(page.url()).pathname, '/', 'The production root must remain on the landing page')
  assert.equal(await page.locator('.developer-layout').count(), 0)
  const openDeveloper = page.getByRole('link', { name: 'Open Developer Mode', exact: true })
  assert.equal(await openDeveloper.getAttribute('href'), '/dev')
  assert.equal(await page.evaluate(() => window.__debugDatabase?.writes.length ?? 0), 0)
  await page.screenshot({ path: resolve(output, 'production-landing.png') })
  await openDeveloper.click()
  await page.waitForURL(`${origin}/dev`)
  await page.getByRole('heading', { name: 'Debug saving fixture', exact: true }).waitFor()
  assert.equal(await page.locator('.debug-save.on').count(), 0)
  assert.equal(await page.evaluate(() => window.__debugDatabase?.writes.length ?? 0), 0)

  const toolRequests = []
  const recordToolRequest = request => {
    if (new URL(request.url()).pathname.startsWith('/api/')) toolRequests.push(request.url())
  }
  page.on('request', recordToolRequest)
  for (const path of ['/prolific', '/prolific/create', '/prolific/synthetic-study',
    '/data', '/data/sessions', '/data/versions/synthetic-version', '/data/sessions/synthetic-session']) {
    await page.goto(`${origin}${path}`)
    const tool = path.startsWith('/prolific') ? 'Prolific' : 'Data'
    await page.getByText(`${tool} isn't available on the hosted website.`, { exact: true }).waitFor()
    assert.equal(new URL(page.url()).pathname, path, 'Hosted notices preserve direct tool URLs')
    assert.equal(await page.getByRole('link', { name: 'Prolific', exact: true }).count(), 1)
    assert.equal(await page.getByRole('link', { name: 'Data', exact: true }).count(), 1)
    assert.equal(await page.locator('main code').innerText(), 'bun run dev')
    assert.equal(await page.evaluate(() => window.__debugDatabase?.writes.length ?? 0), 0)
  }
  assert.deepEqual(toolRequests, [], 'Hosted notices do not initialize tool APIs')
  page.off('request', recordToolRequest)
  await page.getByRole('link', { name: 'Develop', exact: true }).click()
  await page.getByRole('heading', { name: 'Debug saving fixture', exact: true }).waitFor()

  await page.goto(`${origin}/dev?session_id=debug-static&mode=debug`)
  await page.locator('.debug-save.on').waitFor({ timeout: 20000 })
  const saved = await page.evaluate(() => window.__debugDatabase.values['debug/meta/debug-static'])
  assert.equal(saved.version, deployment.version)
  assert.equal(saved.sha, deployment.fullSha)
  assert.equal(saved.deploymentId, deployment.id)
  const expectedCode = execFileSync('bun', ['--eval',
    `import { getCompletionCode } from './core/internal/prolific.ts';
     console.log(getCompletionCode('COMPLETED', ${JSON.stringify(deployment.version)}))`],
  { cwd: root, encoding: 'utf8' }).trim()
  assert.equal(await page.getByTestId('completion-code').innerText(), expectedCode,
    'The compiled participant code matches the code created for this dataset by the dashboard')
  await page.evaluate(() => {
    window.__debugDatabase.values.deployStatus = { id: 'next', version: 'next-version', sha: 'bbbbbbbb' }
    window.__debugDatabase.values.deploymentVersion = 'next-version'
  })
  await page.getByRole('button', { name: 'Respond', exact: true }).click()
  assert.equal(await page.getByTestId('completion-code').innerText(), expectedCode)
  assert.equal(await page.evaluate(() => window.__debugDatabase.values['debug/meta/debug-static'].version), deployment.version)

  const sessionId = '1'.repeat(24)
  await page.goto(`${origin}/exp?SESSION_ID=${sessionId}&STUDY_ID=${'2'.repeat(24)}&PROLIFIC_PID=${'3'.repeat(24)}`)
  await page.waitForFunction(id => window.__debugDatabase?.values[`live/meta/${id}`], sessionId)
  const live = await page.evaluate(id => window.__debugDatabase.values[`live/meta/${id}`], sessionId)
  assert.equal(live.version, deployment.version)
  assert.equal(live.deploymentId, deployment.id)
  assert.equal(live.sha, deployment.fullSha)
  assert.equal(await page.getByTestId('completion-code').innerText(), expectedCode)
  assert.deepEqual(errors, [])
  await page.screenshot({ path: resolve(output, 'compiled-deployment.png') })
  console.log(`Compiled deployment identity and completion code checks passed; ${output}`)
} finally {
  await browser.close()
  await new Promise(resolve => server.close(resolve))
  await cleanBuild()
  log.end()
}
