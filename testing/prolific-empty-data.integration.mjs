import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

// Real study page and review/data composables; all backend traffic uses read-only fixtures.
const fixture = JSON.parse(await readFile(new URL('../operations/fixtures/review-study.json', import.meta.url)))
const url = new URL(`/prolific/${fixture.id}`, process.argv[2])
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && url.protocol === 'http:')
const output = resolve(process.argv[3] ?? '.experiment-tests/prolific-empty-data')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
try {
  for (const scenario of ['empty', 'submissions', 'loading']) {
    const study = { ...fixture, submissions: scenario === 'empty' ? [] : fixture.submissions }
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
    let cachedSession = null
    await context.addInitScript(scenario => { window.emptyDataScenario = scenario }, scenario)
    await context.route('**/*', async route => {
      const request = route.request()
      const target = new URL(request.url())
      if (target.origin !== url.origin) return route.abort('blockedbyclient')
      if (target.pathname.endsWith('/composables/useDatabase.ts')) {
        const response = await route.fetch()
        const source = await response.text()
        const vue = source.match(/from "([^"]*vue\.runtime[^"]*)"/)[1]
        return route.fulfill({ contentType: 'text/javascript', body: `
          import { ref } from ${JSON.stringify(vue)};
          const snapshot = { val: () => null, exists: () => false };
          export const useDatabase = () => ({
            get: async () => snapshot,
            onValue: (_, callback) => { callback(snapshot); return () => {}; },
            set: async () => {}, update: async () => {},
            sync: (path, initial) => Object.assign(ref(path === '/prolificProjectId' ? 'a'.repeat(24) : initial),
              { ready: true }),
          });
        ` })
      }
      if (target.pathname.endsWith('/internal/local-data.ts')) {
        const response = await route.fetch()
        const source = await response.text()
        const sdk = /from "[^"]*\/firebase_database\.js[^"]*"/
        assert.match(source, sdk)
        return route.fulfill({ contentType: 'text/javascript', body: source.replace(sdk, 'from "/fixture-database.js"') })
      }
      if (target.pathname === '/fixture-database.js') {
        return route.fulfill({ contentType: 'text/javascript', body: `
          export const ref = (_, path) => path;
          export const get = async () => { throw new Error('Unexpected database read'); };
          export const onValue = (path, callback, cancel) => {
            const setData = value => callback({ val: () => value, exists: () => value !== null });
            if (path.startsWith('live/meta/')) {
              window.sessionControls = { setData, deny: () => cancel(new Error('Permission denied')) };
              return () => {};
            }
            if (path === 'live/meta') window.emptyDataControls = { setData };
            if (window.emptyDataScenario !== 'loading') setData(null);
            return () => {};
          };
        ` })
      }
      if (target.pathname.startsWith('/api/')) {
        const path = target.pathname.replace(/\/$/, '')
        if (path === `/api/data/raw/live/${study.submissions[0]?.id}.json`) {
          assert.equal(target.searchParams.get('optional'), 'true')
          return cachedSession ? route.fulfill({ json: cachedSession }) : route.fulfill({ status: 204 })
        }
        const json = path === '/api/prolific/token' ? { token: 'fixture-token' }
          : path === `/api/prolific/projects/${'a'.repeat(24)}` ? { id: 'a'.repeat(24) }
          : path === `/api/prolific/studies/${study.id}` ? study
          : path === `/api/prolific/studies/${study.id}/submissions` ? { results: study.submissions }
          : path === '/api/prolific/users/me' ? { id: 'fixture-researcher' }
          : path.includes('/studies') ? { results: [study], meta: { count: 1 } }
          : path.includes('/messages') ? { results: [] } : {}
        return route.fulfill({ json })
      }
      return ['GET', 'HEAD'].includes(request.method()) ? route.continue() : route.abort('blockedbyclient')
    })
    await context.routeWebSocket('**/*', socket => socket.close())
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    try {
      await page.goto(url.href)
      await page.getByRole('heading', { name: study.internal_name, exact: true }).waitFor({ timeout: 15000 })
      const table = page.getByRole('table')
      if (scenario === 'loading') {
        await page.getByText('loading submissions...', { exact: true }).waitFor()
        assert.equal(await table.count(), 0)
        await page.evaluate(() => window.emptyDataControls.setData(null))
      }
      assert.equal(await page.getByText('failed to load submissions; check database', { exact: true }).count(), 0)
      await page.getByRole('heading', {
        name: `Submissions (${study.submissions.length} / ${study.submissions.length})`, exact: true,
      }).waitFor()
      await page.getByText('No experiment sessions have been recorded yet.', { exact: true }).waitFor()
      const rows = table.locator('tbody tr')
      assert.equal(await rows.count(), study.submissions.length)
      if (study.submissions.length) {
        assert.equal(await rows.first().locator('td').nth(5).innerText(), 'missing')
        const submission = study.submissions[0]
        const matchingRow = rows.filter({ has: page.getByRole('link', { name: submission.id, exact: true }) })
        await page.evaluate(({ studyId, submission }) => {
          window.emptyDataControls.setData({ [submission.id]: {
            sessionId: submission.id, studyId, participantId: submission.participant_id,
            version: 'fixture', mode: 'live', assignment: 0, bonus: 0,
            startTime: 1000, noReturnTime: 1500, completionTime: 2000, lastUpdateTime: 2000,
          } })
        }, { studyId: study.id, submission })
        await matchingRow.locator('td').nth(5).getByText('full', { exact: true }).waitFor()
        assert.equal(await page.getByText('No experiment sessions have been recorded yet.', { exact: true }).count(), 0)
        assert.equal(await rows.count(), study.submissions.length)
        await page.evaluate(() => window.emptyDataControls.setData(null))
        await page.getByText('No experiment sessions have been recorded yet.', { exact: true }).waitFor()
        assert.equal(await rows.first().locator('td').nth(5).innerText(), 'missing')
      }
      await page.screenshot({ path: resolve(output, `${scenario}.png`), fullPage: true })
      if (scenario === 'submissions') {
        const id = study.submissions[0].id
        const meta = { sessionId: id, mode: 'live', startTime: 1000, lastUpdateTime: 2000, version: 'fixture' }
        await page.getByRole('link', { name: id, exact: true }).click()
        await page.getByText('Checking for live session data…').waitFor()
        await page.evaluate(() => window.sessionControls.setData(null))
        const missing = page.getByText('No live session data was found in Firebase or on this computer.')
        await missing.waitFor()
        await page.evaluate(meta => window.sessionControls.setData(meta), meta)
        await page.getByRole('link', { name: 'fixture', exact: true }).waitFor()
        await page.evaluate(() => window.sessionControls.setData(null))
        await missing.waitFor()
        await page.evaluate(() => window.sessionControls.deny())
        await page.getByRole('alert').filter({ hasText: 'Permission denied' }).waitFor()
        assert.equal(await missing.count(), 0)

        cachedSession = { meta: { ...meta, version: 'cached' }, events: [] }
        await page.reload()
        await page.getByRole('link', { name: 'cached', exact: true }).waitFor()
        await page.evaluate(() => window.sessionControls.deny())
        await page.getByRole('alert').filter({ hasText: 'Permission denied' }).waitFor()
        await page.getByText('Showing the downloaded copy.').waitFor()
        await page.getByRole('link', { name: 'cached', exact: true }).waitFor()
      }
      assert.deepEqual(errors, [], `${scenario}: no browser runtime errors`)
    } catch (error) {
      await page.screenshot({ path: resolve(output, `${scenario}-failure.png`), fullPage: true })
      await writeFile(resolve(output, `${scenario}-failure.txt`), await page.locator('body').innerText())
      console.error({ scenario, errors })
      throw error
    } finally { await context.close() }
  }
  console.log(`Passed: submission review, session loading, missing data, live updates, denied access and cached fallback; ${output}`)
} finally { await browser.close() }
