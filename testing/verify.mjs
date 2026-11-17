import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const vitest = fileURLToPath(new URL('./vitest.mjs', import.meta.resolve('vitest/package.json')))
for (const [command, args] of [
  ['node', [vitest, 'run', '--config', 'core/testing/vitest.config.mjs', 'core/testing']],
  ['node', ['--test', 'core/testing/browser.integration.mjs', 'core/testing/agent/session.integration.mjs']],
  ['node', ['core/testing/outline.integration.mjs']],
  ['node', ['core/testing/visual/verify.mjs']],
  ['node', ['core/testing/replay/verify.mjs']],
  ['node', ['core/testing/validation/adversarial.mjs']],
]) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status || 1)
}
