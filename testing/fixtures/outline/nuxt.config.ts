import { fileURLToPath } from 'node:url'

export default defineNuxtConfig({
  extends: ['../../../'],
  // Core's project-relative imports expect a core/ directory in the consuming app.
  hooks: {
    'vite:extendConfig'(config) {
      const alias = { find: '~/core', replacement: fileURLToPath(new URL('../../../', import.meta.url)) }
      config.resolve ??= {}
      const existing = config.resolve.alias ?? {}
      config.resolve.alias = [alias, ...(Array.isArray(existing) ? existing
        : Object.entries(existing).map(([find, replacement]) => ({ find, replacement })))]
    },
  },
  alias: { '~/core': fileURLToPath(new URL('../../../', import.meta.url)) },
  devtools: { enabled: false },
  posthogConfig: {
    publicKey: 'NULL',
    host: 'https://outline-fixture.invalid',
    sourcemaps: { enabled: false, personalApiKey: 'NULL' },
  },
  components: [{ path: './components', pathPrefix: false, global: true }],
  compatibilityDate: '2025-05-15',
})
