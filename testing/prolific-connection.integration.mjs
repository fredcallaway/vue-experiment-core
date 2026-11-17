import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

// Exercise the real connection form with an in-memory database and synthetic API responses.
const url = new URL('/prolific', process.argv[2])
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && url.protocol === 'http:')
const output = resolve(process.argv[3] ?? '.experiment-tests/prolific-connection')
await mkdir(output, { recursive: true })
const workspaceId = 'a'.repeat(24)
const projectId = 'b'.repeat(24)
const token = 'synthetic-prolific-token'
const browser = await chromium.launch({ headless: true })
const checks = []
try {
  for (const scenario of ['saved-html', 'html', 'upstream-html', 'malformed', 'unexpected-json',
    'invalid-token', 'empty', 'create']) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, serviceWorkers: 'block' })
    let fail = true
    let creations = 0
    const consoleMessages = []
    const errors = []
    await context.route('**/*', async route => {
      const request = route.request()
      const target = new URL(request.url())
      if (target.origin !== url.origin) return route.abort('blockedbyclient')
      if (target.pathname.endsWith('/composables/useDatabase.ts')) {
        const source = await (await route.fetch()).text()
        const vue = source.match(/from "([^"]*vue\.runtime[^"]*)"/)[1]
        return route.fulfill({ contentType: 'text/javascript', body: `
          import { ref } from ${JSON.stringify(vue)};
          const state = { '/studyDraft': {} };
          const snap = path => ({ val: () => state[path] ?? null, exists: () => state[path] != null });
          export const useDatabase = () => ({
            get: async path => snap(path),
            onValue: (path, callback) => { callback(snap(path)); return () => {}; },
            set: async (path, value) => { state[path] = value; },
            sync: (path, initial) => { const value = ref(initial); value.ready = true; return value; },
          });
        ` })
      }
      if (target.pathname.endsWith('/internal/local-data.ts')) {
        const source = await (await route.fetch()).text()
        const vue = source.match(/from "([^"]*vue\.runtime[^"]*)"/)[1]
        return route.fulfill({ contentType: 'text/javascript', body: `
          import { ref } from ${JSON.stringify(vue)};
          export const useAllData = () => ({ sessions: ref({}), isLoading: ref(false) });
        ` })
      }
      if (target.pathname.startsWith('/api/')) {
        if (target.pathname === '/api/prolific/token') {
          if (scenario === 'saved-html' && fail && request.method() === 'GET') {
            return route.fulfill({ contentType: 'text/html', body: '<!DOCTYPE html><p>Static fallback</p>' })
          }
          return route.fulfill({ json: request.method() === 'GET' ? { token } : { success: true } })
        }
        if (target.pathname === '/api/prolific/workspaces/') {
          if (fail) {
            if (['html', 'upstream-html'].includes(scenario)) {
              return route.fulfill({ status: scenario === 'html' ? 200 : 502,
                contentType: 'text/html', body: '<!DOCTYPE html><p>Server error</p>' })
            }
            if (scenario === 'malformed') return route.fulfill({ contentType: 'application/json', body: '{broken' })
            if (scenario === 'unexpected-json') return route.fulfill({ json: {} })
            if (scenario === 'invalid-token') return route.fulfill({ status: 401, json: { detail: 'Invalid token.' } })
          }
          return route.fulfill({ json: { results: scenario === 'empty' ? [] : [{ id: workspaceId, title: 'Lab' }] } })
        }
        if (target.pathname === `/api/prolific/workspaces/${workspaceId}/projects/`) {
          if (request.method() === 'POST') {
            assert.deepEqual(request.postDataJSON(), { title: 'Connection test' })
            creations++
            return route.fulfill({ status: 201, json: { id: projectId, title: 'Connection test' } })
          }
          return route.fulfill({ json: { results: [] } })
        }
        if (target.pathname === `/api/prolific/projects/${projectId}/`) {
          return route.fulfill({ json: { id: projectId, title: 'Connection test' } })
        }
        return route.fulfill({ json: { results: [], meta: { count: 0 }, id: 'c'.repeat(24) } })
      }
      return ['GET', 'HEAD'].includes(request.method()) ? route.continue() : route.abort('blockedbyclient')
    })
    await context.routeWebSocket('**/*', socket => socket.close())
    const page = await context.newPage()
    page.setDefaultTimeout(20_000)
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => consoleMessages.push(message.text()))
    try {
      await page.goto(url.href)
      const form = page.getByRole('region', { name: 'Prolific Connection' })
      const alert = form.getByRole('alert')
      if (['saved-html', 'html', 'upstream-html', 'malformed', 'unexpected-json'].includes(scenario)) {
        await alert.getByText(/returned .*JSON/).waitFor()
        if (scenario !== 'unexpected-json') {
          assert.match(await alert.innerText(), /local development server started with bun run dev/)
        }
        assert.match(await alert.innerText(), scenario === 'saved-html' ? /\/api\/prolific\/token/ : /workspaces/)
        assert.equal(await form.getByText('✓ Valid', { exact: true }).count(), 0)
        assert.equal(await form.getByText('Not verified', { exact: true }).count(), 2)
        await page.screenshot({ path: resolve(output, `${scenario}.png`), fullPage: true })
        fail = false
        await alert.getByRole('button', { name: 'Retry connection' }).click()
        await form.getByText('✓ Valid', { exact: true }).waitFor()
        await page.getByRole('option', { name: 'Lab', exact: true }).waitFor({ state: 'attached' })
      } else if (scenario === 'invalid-token') {
        await form.getByText('✗ Missing or invalid', { exact: true }).first().waitFor()
        assert.equal(await form.getByText('✓ Valid', { exact: true }).count(), 0)
        assert.ok(await page.getByRole('button', { name: 'Create Project', exact: true }).isDisabled())
      } else if (scenario === 'empty') {
        await alert.getByText('No Prolific workspaces were found for this API token.', { exact: true }).waitFor()
        await form.getByText('✓ Valid', { exact: true }).waitFor()
        assert.ok(await page.getByRole('button', { name: 'Create Project', exact: true }).isDisabled())
      } else {
        await form.getByText('✓ Valid', { exact: true }).waitFor()
        await page.getByRole('textbox', { name: 'Project name' }).fill('Connection test')
        await page.getByRole('button', { name: 'Create Project', exact: true }).click()
        await page.getByRole('button', { name: 'Create New Study', exact: true }).waitFor()
        await page.waitForFunction(() => ![...document.querySelectorAll('button')]
          .find(button => button.textContent.trim() === 'Create New Study').disabled)
        assert.equal(creations, 1)
        await page.getByRole('button', { name: 'Prolific Connection', exact: true }).click()
        assert.equal(await page.getByRole('textbox', { name: 'Project ID', exact: true }).inputValue(), projectId)
        await page.getByText('✓ Connected', { exact: true }).waitFor()
        // A later failed authentication must invalidate the previous green status.
        await page.getByRole('textbox', { name: 'API token', exact: true }).fill('short')
        await page.getByText('✗ Missing or invalid', { exact: true }).first().waitFor()
        assert.equal(await page.getByText('✓ Valid', { exact: true }).count(), 0)
      }
      assert.deepEqual(errors, [], `${scenario}: no unhandled browser errors`)
      assert.ok(consoleMessages.every(message => !message.includes(token)), 'The API token is absent from console logs')
      checks.push(scenario)
    } catch (error) {
      const details = page.getByText('Technical details', { exact: true })
      if (await details.isVisible()) await details.click()
      await page.screenshot({ path: resolve(output, `${scenario}-failure.png`), fullPage: true })
      console.error({ scenario, errors, body: await page.locator('body').innerText(),
        report: await page.getByRole('textbox', { name: 'Error report' }).inputValue().catch(() => '') })
      throw error
    } finally { await context.close() }
  }
  await writeFile(resolve(output, 'result.json'), JSON.stringify({ checks }, null, 2) + '\n')
  console.log(`Passed ${checks.length} Prolific connection scenarios; ${output}`)
} finally { await browser.close() }
