import { expect, test, vi } from 'vitest'

test.each([
  ['implicit default site', { public: '.output/public' }, undefined, false],
  ['explicit default site', { site: 'test-project' }, undefined, false],
  ['nondefault site', { site: 'another-site' }, undefined, true],
  ['target alias', { target: 'experiment' }, undefined, true],
  ['multiple sites', [{ site: 'test-project' }, { site: 'another-site' }], undefined, true],
  ['missing Hosting configuration', undefined, undefined, true],
  ['explicit URL for a nondefault site', { site: 'another-site' }, 'https://another-site.web.app', false],
  ['trailing slash', { site: 'test-project' }, 'https://experiment.example.edu/', false],
  ['nested path', { site: 'test-project' }, 'https://experiment.example.edu/study/', false],
  ['explicit custom domain', { site: 'test-project' }, 'https://experiment.example.edu', false],
])('Prolific base URL handles %s', async (_name, hosting, baseUrl, rejects) => {
  vi.resetModules()
  vi.doMock('~/firebase.config.json', () => ({ default: { projectId: 'test-project' } }))
  vi.doMock('~/firebase.json', () => ({ default: { hosting } }))
  const { DEFAULT_PROLIFIC_CONFIG, getProlificBaseUrl } = await import('./prolific.ts')
  const config = { ...DEFAULT_PROLIFIC_CONFIG, baseUrl: baseUrl ?? DEFAULT_PROLIFIC_CONFIG.baseUrl }
  if (rejects) expect(() => getProlificBaseUrl(config)).toThrow(/FIREBASE_DEFAULT requires.*default Firebase Hosting site/)
  else expect(getProlificBaseUrl(config)).toBe(baseUrl?.replace(/\/+$/, '') ?? 'https://test-project.web.app')
})
