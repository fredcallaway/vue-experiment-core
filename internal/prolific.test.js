import { expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'

test.each([
  ['implicit default site', { public: '.output/public' }, undefined, false],
  ['explicit default site', { site: 'test-project' }, undefined, false],
  ['nondefault site', { site: 'another-site' }, undefined, true],
  ['target alias', { target: 'experiment' }, undefined, true],
  ['multiple sites', [{ site: 'test-project' }, { site: 'another-site' }], undefined, true],
  ['missing Hosting configuration', undefined, undefined, true],
  ['explicit URL for a nondefault site', { site: 'another-site' }, 'https://another-site.web.app', false],
  ['explicit custom domain', { site: 'test-project' }, 'https://experiment.example.edu', false],
])('Prolific base URL handles %s', (_name, hosting, baseUrl, rejects) => {
  // Isolate mocked project configuration from other tests and use the real URL resolver.
  const result = spawnSync(process.execPath, ['--eval', `
    import { strict as assert } from 'node:assert'
    import { mock } from 'bun:test'
    mock.module('~/firebase.config.json', () => ({ default: { projectId: 'test-project' } }))
    mock.module('~/firebase.json', () => ({ default: { hosting: ${JSON.stringify(hosting)} } }))
    const { DEFAULT_PROLIFIC_CONFIG, getProlificBaseUrl } = await import('./core/internal/prolific.ts')
    const baseUrl = ${JSON.stringify(baseUrl)} ?? DEFAULT_PROLIFIC_CONFIG.baseUrl
    const config = { ...DEFAULT_PROLIFIC_CONFIG, baseUrl }
    if (${rejects}) {
      assert.throws(() => getProlificBaseUrl(config), /FIREBASE_DEFAULT requires.*default Firebase Hosting site/)
    } else {
      assert.equal(getProlificBaseUrl(config), ${JSON.stringify(baseUrl ?? 'https://test-project.web.app/')})
    }
  `], { cwd: new URL('../..', import.meta.url), encoding: 'utf8' })
  expect(result.stderr + result.stdout).toBe('')
  expect(result.status).toBe(0)
})
