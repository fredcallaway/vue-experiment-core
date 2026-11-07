import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

// Real dashboard/composables with an in-memory database and no external network or live mutations.
const url = new URL('/prolific/create', process.argv[2])
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && url.protocol === 'http:')
const output = resolve(process.argv[3] ?? '.experiment-tests/deployment-safety')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
try {
  for (const scenario of ['posted', 'draft', 'same-build', 'placeholder']) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, serviceWorkers: 'block' })
    await context.addInitScript(({ scenario }) => {
      window.deploymentFixture = {
        studies: { prior: { version: '0.1', sha: scenario === 'same-build' ? 'bbbbbbbb' : 'aaaaaaaa',
          ...(scenario === 'draft' ? {} : { publishTime: 1 }) } },
        deployStatus: { sha: 'aaaaaaaa', version: '0.1' },
        deploymentVersion: '0.1',
        studyDraft: { reward: 200, estimated_completion_time: 10, total_available_places: 5 },
      }
    }, { scenario })
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
          const state = window.deploymentFixture;
          const value = path => path.split('/').filter(Boolean).reduce((x, key) => x?.[key], state) ?? null;
          const snap = path => ({ val: () => structuredClone(value(path)), exists: () => value(path) !== null });
          export const useDatabase = () => ({
            get: async path => snap(path),
            onValue: (path, callback) => { callback(snap(path)); return () => {}; },
            set: async (path, data) => { state[path] = structuredClone(data); },
            update: async (path, data) => { Object.assign(value(path), structuredClone(data)); },
            sync: (path, initial) => {
              const data = ref(value(path) ?? initial);
              data.ready = true;
              data.syncImmediate = async () => { state[path] = data.value; };
              return data;
            },
          });
        ` })
      }
      if (target.pathname.endsWith('/composables/useProlific.ts')) {
        return route.fulfill({ contentType: 'text/javascript', body: 'export const useProlific = () => ({});' })
      }
      if (target.pathname.endsWith('/epoch.config.ts') && scenario !== 'placeholder') {
        const response = await route.fetch()
        return route.fulfill({ response, body: (await response.text())
          .replace('yourEmailAddress@fakeDomain.foo', 'researcher@university.edu') })
      }
      if (target.pathname.startsWith('/api/')) {
        if (target.pathname === '/api/prolific/deploy') {
          assert.equal(request.postDataJSON().allowVersionReuse, scenario === 'posted')
          deploys++
          return route.fulfill({ json: { success: true, sha: 'bbbbbbbb', id: 'fixture-deployment',
            version: request.postDataJSON().version } })
        }
        const json = target.pathname === '/api/prolific/git-status'
          ? { sha: 'bbbbbbbb', dirty: false, gitStatusOutput: '' } : {}
        return route.fulfill({ json })
      }
      return ['GET', 'HEAD'].includes(request.method()) ? route.continue() : route.abort('blockedbyclient')
    })
    await context.routeWebSocket('**/*', socket => socket.close())
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(url.href)
    const deploy = page.getByRole('button', { name: 'Deploy Website', exact: true })
    const publish = page.getByRole('button', { name: 'Create & Publish Study', exact: true })
    const acknowledge = page.getByRole('checkbox', {
      name: 'I reviewed the changes and intentionally keep this experiment version.',
    })
    await deploy.waitFor({ timeout: 15000 }).catch(async error => {
      await page.screenshot({ path: resolve(output, `${scenario}-failure.png`), fullPage: true })
      console.error({ scenario, errors, text: await page.locator('body').innerText() })
      throw error
    })
    if (scenario === 'placeholder') {
      await page.getByText('epoch.config.ts has not been configured').waitFor()
      assert.ok(await deploy.isDisabled())
      assert.ok(await publish.isDisabled())
      assert.equal(deploys, 0)
    } else {
      await page.getByText('Ready to deploy!', { exact: false }).waitFor()
      if (scenario === 'posted') {
        await acknowledge.waitFor()
        assert.ok(await deploy.isDisabled())
        await page.getByRole('checkbox', { name: 'Bypass deployment check' }).check()
        assert.ok(await publish.isDisabled(), 'The deployment bypass does not bypass the version warning')
        await acknowledge.check()
        assert.ok(await publish.isEnabled())
        await page.screenshot({ path: resolve(output, 'posted-version-warning.png'), fullPage: true })
      } else {
        assert.equal(await acknowledge.count(), 0, 'Unposted fixes and same-code batches do not warn')
      }
      assert.ok(await deploy.isEnabled())
      await deploy.click()
      await page.getByText('Deployed and ready to publish', { exact: false }).waitFor()
      assert.equal(deploys, 1)

      if (scenario === 'same-build') {
        await page.getByRole('textbox', { name: 'Dataset version', exact: true }).fill('main-study')
        await page.getByText('Ready to deploy!', { exact: false }).waitFor()
        await page.getByRole('checkbox', { name: 'Bypass deployment check' }).check()
        assert.ok(await publish.isDisabled(), 'A Git/deployment bypass cannot relabel an existing deployment')
        await deploy.click()
        await page.getByText('Deployed and ready to publish', { exact: false }).waitFor()
        assert.equal(deploys, 2)
        assert.equal(await page.evaluate(() => window.deploymentFixture.deploymentVersion), 'main-study')
        await page.screenshot({ path: resolve(output, 'dataset-version-selection.png'), fullPage: true })
      }

      if (scenario === 'posted') {
        const result = await page.evaluate(async () => {
          const { useStudies } = await import('/_nuxt/core/internal/composables/useStudies.ts')
          const studies = useStudies()
          const fixture = window.deploymentFixture
          fixture.studies.newDraft = { version: '0.1', sha: 'aaaaaaaa', completionCodes: { COMPLETED: 'keep-code' } }
          fixture.deployStatus = { version: '0.1', sha: 'bbbbbbbb', fullSha: 'b'.repeat(40) }
          const prepared = await studies.preparePublication('newDraft')
          await studies.publishStudy('newDraft', prepared.deployment)
          fixture.deployStatus.version = '0.2'
          let mismatch
          try { await studies.preparePublication('newDraft') } catch (error) { mismatch = error.message }
          return { prepared, stored: fixture.studies.newDraft, mismatch }
        })
        assert.equal(result.prepared.warnings.length, 1)
        assert.equal(result.stored.sha, 'b'.repeat(40),
          'Posting attributes the currently deployed build, not the draft build')
        assert.ok(result.stored.publishTime > 0)
        assert.deepEqual(result.stored.completionCodes, { COMPLETED: 'keep-code' })
        assert.match(result.mismatch, /draft version must match/)
      }
    }
    assert.deepEqual(errors, [], `${scenario}: no browser runtime errors`)
    await context.close()
  }
  console.log('Passed: posted-version acknowledgment, bypass isolation, draft/same-build reuse, contact guard, ' +
    `publication identity; ${output}`)
} finally {
  await browser.close()
}
