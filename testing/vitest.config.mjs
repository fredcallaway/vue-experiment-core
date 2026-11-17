import { defineConfig } from 'vitest/config'
import { compileScript, parse } from '@vue/compiler-sfc'
import { transformWithEsbuild } from 'vite'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [{
    name: 'completion-test-sfc',
    async transform(source, id) {
      if (!id.endsWith('/ECompletion.vue')) return
      const { descriptor } = parse(source)
      const script = compileScript(descriptor, { id: 'completion-test', inlineTemplate: true })
      return transformWithEsbuild(script.content, id, { loader: 'ts' })
    },
  }],
  resolve: { alias: { '~': fileURLToPath(new URL('../../', import.meta.url)) } },
  test: {
    include: ['core/**/*.test.js'],
    pool: 'forks',
    // Some integration tests change cwd; keep their real process isolation.
    maxWorkers: 1,
    testTimeout: 30_000,
  },
})
