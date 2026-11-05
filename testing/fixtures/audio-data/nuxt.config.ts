import { fileURLToPath } from 'node:url'

export default defineNuxtConfig({
  extends: ['../outline'],
  hooks: {
    'vite:extendConfig'(config) {
      const mocks = fileURLToPath(new URL('./mocks/sessions.ts', import.meta.url))
      const aliases = [
        { find: '../../../internal/local-data', replacement: mocks },
        { find: '../../internal/local-data', replacement: mocks },
        { find: '../../../internal/composables/useProlificMessages', replacement: mocks },
      ]
      const existing = config.resolve?.alias ?? []
      config.resolve ??= {}
      config.resolve.alias = [...aliases, ...(Array.isArray(existing) ? existing
        : Object.entries(existing).map(([find, replacement]) => ({ find, replacement })))]
    },
  },
})
