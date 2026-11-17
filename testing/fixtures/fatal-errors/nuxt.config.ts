import { fileURLToPath } from 'node:url'

const core = fileURLToPath(new URL('../../../', import.meta.url))

export default defineNuxtConfig({
  extends: ['../../../'],
  alias: { '~/core': core },
  components: [{ path: './components', pathPrefix: false, global: true }],
  devtools: { enabled: false },
  posthogConfig: {
    publicKey: 'NULL', host: 'https://fatal-fixture.invalid',
    sourcemaps: { enabled: false, personalApiKey: 'NULL' },
  },
  hooks: {
    'vite:extendConfig'(config) {
      const aliases = [
        { find: '~/core', replacement: core },
        { find: /^(?:\.\.?\/)+(?:composables\/)?useDatabase$/,
          replacement: fileURLToPath(new URL('../debug-saving/database.ts', import.meta.url)) },
      ]
      config.resolve ??= {}
      const existing = config.resolve.alias ?? []
      config.resolve.alias = [...aliases, ...(Array.isArray(existing) ? existing
        : Object.entries(existing).map(([find, replacement]) => ({ find, replacement })))]
    },
  },
})
