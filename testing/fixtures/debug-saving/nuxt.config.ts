import { fileURLToPath } from 'node:url'

export default defineNuxtConfig({
  extends: ['../outline'],
  components: [{ path: './components', pathPrefix: false, global: true }],
  hooks: {
    'vite:extendConfig'(config) {
      const alias = {
        find: /^(?:\.\.?\/)+(?:composables\/)?useDatabase$/,
        replacement: fileURLToPath(new URL('./database.ts', import.meta.url)),
      }
      config.resolve ??= {}
      const existing = config.resolve.alias ?? []
      config.resolve.alias = [alias, ...(Array.isArray(existing) ? existing
        : Object.entries(existing).map(([find, replacement]) => ({ find, replacement })))]
    },
  },
})
