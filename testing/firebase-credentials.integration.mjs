import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { configureFirebaseCredentials, firebaseCommandError } from '../operations/firebase-auth.ts'

// Start a local dashboard with an empty, disposable HOME, then supply that same home here.
// External requests and database writes are blocked; only the credential-status endpoint reaches the server.
const url = new URL('/prolific/create', process.argv[2])
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && url.protocol === 'http:')
const home = resolve(process.argv[3])
assert.match(home, /\/experiment-firebase-browser\.[^/]+$/, 'Use a disposable credential-test HOME')
assert.equal(process.env.HOME, home, 'The runner and server must use the same disposable HOME')
const store = resolve(home, '.config/experiment-template/firebase')
await rm(store, { recursive: true, force: true })
const output = resolve(process.argv[4])
await mkdir(output, { recursive: true })
const root = process.cwd()
const { projectId } = JSON.parse(await readFile(resolve(root, 'firebase.config.json'), 'utf8'))
const key = { type: 'service_account', project_id: projectId,
  client_email: `fixture@${projectId}.iam.gserviceaccount.com`,
  private_key: generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }) }
const keyFile = resolve(home, 'synthetic-key.json')
await writeFile(keyFile, JSON.stringify(key), { mode: 0o600 })
const browser = await chromium.launch({ headless: true })
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, serviceWorkers: 'block' })
  await context.addInitScript(() => {
    window.credentialFixture = { studies: {}, deployStatus: {}, deploymentVersion: 'pilot-1',
      studyDraft: { reward: 200, estimated_completion_time: 10, total_available_places: 5 } }
  })
  let failureSource = { source: 'shell', projectId }
  let deploys = 0
  await context.route('**/*', async route => {
    const request = route.request()
    const target = new URL(request.url())
    if (target.origin !== url.origin) return route.abort('blockedbyclient')
    if (target.pathname.endsWith('/composables/useDatabase.ts')) {
      const response = await route.fetch()
      const source = await response.text()
      const vue = source.match(/from "([^"]*vue\.runtime[^\"]*)"/)[1]
      return route.fulfill({ contentType: 'text/javascript', body: `
        import { ref } from ${JSON.stringify(vue)};
        const state = window.credentialFixture;
        const value = path => path.split('/').filter(Boolean).reduce((x, key) => x?.[key], state) ?? null;
        const snap = path => ({ val: () => structuredClone(value(path)), exists: () => value(path) !== null });
        export const useDatabase = () => ({
          get: async path => snap(path),
          onValue: (path, callback) => { callback(snap(path)); return () => {}; },
          set: async () => {}, update: async () => {},
          sync: (path, initial) => Object.assign(ref(value(path) ?? initial),
            { ready: true, syncImmediate: async () => {} }),
        });
      ` })
    }
    if (target.pathname.endsWith('/composables/useProlific.ts')) {
      return route.fulfill({ contentType: 'text/javascript', body: 'export const useProlific = () => ({});' })
    }
    if (target.pathname.endsWith('/epoch.config.ts')) {
      const response = await route.fetch()
      return route.fulfill({ response, body: (await response.text())
        .replace('yourEmailAddress@fakeDomain.foo', 'researcher@university.edu') })
    }
    if (target.pathname.startsWith('/api/')) {
      if (target.pathname === '/api/prolific/firebase-auth') return route.continue()
      if (target.pathname === '/api/prolific/deploy') {
        deploys++
        const error = firebaseCommandError({ stderr: 'HTTP 403 PERMISSION_DENIED: firebasehosting.sites.list' },
          failureSource, 'Firebase command failed').message
        return route.fulfill({ json: { success: false, error } })
      }
      return route.fulfill({ json: target.pathname === '/api/prolific/active-studies' ? []
        : target.pathname === '/api/prolific/git-status'
          ? { sha: 'bbbbbbbb', dirty: false, gitStatusOutput: '' } : {} })
    }
    return ['GET', 'HEAD'].includes(request.method()) ? route.continue() : route.abort('blockedbyclient')
  })
  await context.routeWebSocket('**/*', socket => socket.close())
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const source = page.getByTestId('firebase-credentials')
  const version = page.getByRole('textbox', { name: 'Dataset version', exact: true })
  const deploy = page.getByRole('button', { name: 'Deploy Website', exact: true })
  await page.goto(url.href)
  await source.getByText('Shell credentials (no saved key)', { exact: false }).waitFor({ timeout: 30000 })
    .catch(async error => {
      console.error({ errors, text: await page.locator('body').innerText() });
      await page.screenshot({ path: resolve(output, 'failure.png'), fullPage: true });
      throw error;
    })
  await page.getByText('Ready to deploy!', { exact: false }).waitFor()
  const sourceResponse = await (await context.request.get(new URL('/api/prolific/firebase-auth', url).href)).json()
  assert.deepEqual(sourceResponse, { source: 'shell', projectId, error: '' })
  await version.focus()
  await page.evaluate(() => window.scrollTo(0, 150))
  const geometry = async () => ({ source: await source.boundingBox(), version: await version.boundingBox(),
    deploy: await deploy.boundingBox(), scroll: await page.evaluate(() => window.scrollY) })
  const baseline = await geometry()
  const configured = await configureFirebaseCredentials(root, keyFile)
  await source.getByText('Saved project key', { exact: false }).waitFor()
  await source.getByText(key.client_email, { exact: false }).waitFor()
  assert.deepEqual(await geometry(), baseline, 'Source transitions keep controls and scroll fixed')
  assert.ok(await version.evaluate(element => element === document.activeElement))
  assert.equal((await stat(configured.credentialFile)).mode & 0o777, 0o600)
  assert.equal((await stat(resolve(configured.credentialFile, '..'))).mode & 0o777, 0o700)
  await page.screenshot({ path: resolve(output, 'saved-project-key.png'), fullPage: true })

  const rotated = { ...key, client_email: `rotated@${projectId}.iam.gserviceaccount.com` }
  await writeFile(keyFile, JSON.stringify(rotated))
  await configureFirebaseCredentials(root, keyFile)
  await source.getByText(rotated.client_email, { exact: false }).waitFor()
  assert.deepEqual(await geometry(), baseline, 'Rotation does not shift the form')
  await rm(configured.credentialFile)
  await page.getByRole('alert').filter({ hasText: 'saved project key file is missing' }).waitFor()
  assert.deepEqual(await geometry(), baseline, 'Credential errors overlay the form without shifting it')
  assert.ok(await deploy.isDisabled())
  await page.screenshot({ path: resolve(output, 'missing-key.png'), fullPage: true })
  await configureFirebaseCredentials(root, keyFile)
  await page.getByRole('alert').filter({ hasText: 'saved project key file is missing' }).waitFor({ state: 'hidden' })
  assert.deepEqual(await geometry(), baseline)
  assert.ok(await deploy.isEnabled())

  // Both error variants use the shared production formatter; the backend deployment itself is never invoked.
  for (const credentialSource of ['project-key', 'shell']) {
    failureSource = { source: credentialSource, projectId,
      ...(credentialSource === 'project-key' ? { serviceAccount: rotated.client_email } : {}) }
    if (credentialSource === 'shell') {
      await rm(resolve(configured.credentialFile, '..'), { recursive: true })
      await source.getByText('Shell credentials (no saved key)', { exact: false }).waitFor()
    }
    await deploy.scrollIntoViewIfNeeded()
    const beforeFailure = await geometry()
    await deploy.click()
    const message = credentialSource === 'shell'
      ? 'A project key may be missing' : "service account's project permissions"
    await page.getByText(message, { exact: false }).first().waitFor()
    const dismiss = page.getByRole('button', { name: 'Dismiss Error', exact: true })
    assert.deepEqual({ source: await source.boundingBox(), version: await version.boundingBox(),
      deploy: await dismiss.boundingBox(), scroll: await page.evaluate(() => window.scrollY) }, beforeFailure,
    'Deployment failures preserve the form and action bounds')
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      'Long deployment diagnostics cannot overflow the page')
    const body = await page.locator('body').innerText()
    assert.ok(body.includes('Firebase permission denied'))
    assert.ok(body.includes('firebasehosting.sites.list'))
    assert.ok(!body.includes('BEGIN PRIVATE KEY'))
    await page.screenshot({ path: resolve(output, `${credentialSource}-permission-error.png`), fullPage: true })
    await page.getByRole('button', { name: 'Dismiss Error', exact: true }).click()
  }
  assert.equal(deploys, 2)
  await page.setViewportSize({ width: 1280, height: 900 })
  await deploy.click()
  const notice = page.getByRole('alert').filter({ hasText: 'A project key may be missing' })
  await notice.waitFor()
  const bounds = await notice.boundingBox()
  assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 1280)
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
  await page.screenshot({ path: resolve(output, 'narrow-permission-error.png'), fullPage: true })
  assert.deepEqual(errors, [])
  console.log('Passed: real source endpoint, shell fallback, key registration/rotation, private permissions, ' +
    'missing-key recovery, stable geometry/focus/scroll, and source-aware deployment errors.')
} finally {
  await browser.close()
  await rm(keyFile, { force: true })
  await rm(store, { recursive: true, force: true })
}
