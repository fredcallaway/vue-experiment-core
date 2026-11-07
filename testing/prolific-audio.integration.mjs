import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

// Exercise the real form, draft persistence, and study payload without external writes.
const url = new URL('/prolific/create', process.argv[2])
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && url.protocol === 'http:')
const output = resolve(process.argv[3] ?? '.experiment-tests/prolific-audio')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1100 }, serviceWorkers: 'block' })
  await context.addInitScript(() => {
    window.audioStudyFixture = JSON.parse(localStorage.getItem('audioStudyFixture') ?? 'null') ?? {
      studies: {}, prolificProjectId: 'fixture-project',
      deployStatus: { sha: 'bbbbbbbb', version: '0.1' },
      studyDraft: { exclusions: { databaseParticipants: true, previousStudies: false } },
      live: { meta: {
        synthetic: { participantId: '111111111111111111111111', synthetic: true, excluded: true },
        excludedParticipant: { participantId: 'aaaaaaaaaaaaaaaaaaaaaaaa', excluded: true },
        preview: { participantId: 'debug-preview' },
      } },
    }
  })
  let payload
  const errors = []
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
        const state = window.audioStudyFixture;
        const value = path => path.split('/').filter(Boolean).reduce((x, key) => x?.[key], state) ?? null;
        const snap = path => ({ val: () => structuredClone(value(path)), exists: () => value(path) !== null });
        const set = (path, data) => {
          const keys = path.split('/').filter(Boolean);
          const key = keys.pop();
          const parent = keys.reduce((x, key) => x[key] ??= {}, state);
          parent[key] = structuredClone(data);
          localStorage.setItem('audioStudyFixture', JSON.stringify(state));
        };
        export const useDatabase = () => ({
          get: async path => snap(path), set: async (path, data) => set(path, data),
          onValue: (path, callback) => { callback(snap(path)); return () => {}; },
          update: async (path, data) => set(path, { ...value(path), ...data }),
          sync: (path, initial) => Object.assign(ref(value(path) ?? initial), { ready: true }),
        });
      ` })
    }
    if (target.pathname.endsWith('/epoch.config.ts')) {
      const response = await route.fetch()
      return route.fulfill({ response, body: (await response.text())
        .replace('yourEmailAddress@fakeDomain.foo', 'researcher@university.edu') })
    }
    if (target.pathname.startsWith('/api/')) {
      if (target.pathname === '/api/prolific/studies/' && request.method() === 'POST') {
        payload = request.postDataJSON()
        return route.fulfill({ json: { id: 'fixture-study' } })
      }
      let json = {}
      if (target.pathname === '/api/prolific/token') json = { token: 'fixture-token' }
      if (target.pathname === '/api/prolific/git-status') json = { sha: 'bbbbbbbb', dirty: false }
      if (target.pathname === '/api/prolific/filters/') json = { results: [
        { filter_id: 'custom_blocklist', data_type: 'ParticipantID' },
      ] }
      if (target.pathname.includes('/submissions')) json = { results: [] }
      else if (target.pathname === '/api/prolific/studies/fixture-study') json = {
        ...payload, id: 'fixture-study', status: 'UNPUBLISHED', date_created: new Date(0).toISOString(),
        places_taken: 0, total_cost: 0,
      }
      else if (target.pathname === '/api/prolific/studies/') json = { results: [], meta: { count: 0 } }
      else if (target.pathname.endsWith('/studies')) json = { results: [], meta: { count: 0 } }
      else if (target.pathname.includes('/messages')) json = { results: [] }
      return route.fulfill({ json })
    }
    return ['GET', 'HEAD'].includes(request.method()) ? route.continue() : route.abort('blockedbyclient')
  })
  await context.routeWebSocket('**/*', socket => socket.close())
  const page = await context.newPage()
  page.on('pageerror', error => errors.push(error.stack || error.message))
  await page.goto(url.href)
  const microphone = page.getByRole('checkbox', { name: 'Microphone (audio recording)', exact: true })
  const playback = page.getByRole('checkbox', { name: 'Audio playback (speakers or headphones)', exact: true })
  await microphone.waitFor({ timeout: 30000 })
  assert.equal(await microphone.isChecked(), false)
  assert.equal(await playback.isChecked(), false)
  await microphone.check()
  await playback.check()
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('audioStudyFixture'))
    ?.studyDraft.peripheral_requirements?.length === 2)
  await page.reload()
  await microphone.waitFor()
  assert.equal(await microphone.isChecked(), true)
  assert.equal(await playback.isChecked(), true)
  await page.screenshot({ path: resolve(output, 'audio-requirements.png'), fullPage: true })
  await page.getByRole('button', { name: 'Create Draft', exact: true }).click()
  await page.waitForURL('**/prolific/fixture-study')
  assert.deepEqual(payload.peripheral_requirements, ['microphone', 'audio'])
  const expectedCodes = await page.evaluate(async () => {
    const { createCompletionCodes } = await import('/_nuxt/core/internal/prolific.ts')
    return createCompletionCodes(window.audioStudyFixture.deployStatus.version)
  })
  assert.deepEqual(payload.completion_codes, expectedCodes, 'Study codes use the deployed dataset version')
  assert.equal(await page.evaluate(() => window.audioStudyFixture.studies['fixture-study'].version), '0.1')
  assert.deepEqual(payload.filters.find(filter => filter.filter_id === 'custom_blocklist').selected_values,
    ['aaaaaaaaaaaaaaaaaaaaaaaa'], 'Skip synthetic identities while retaining excluded real participants')
  assert.deepEqual(errors, [])
  console.log(`Prolific audio requirements persist across reload and reach the study payload; ${output}`)
} finally {
  await browser.close()
}
