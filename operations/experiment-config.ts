import { contactEmailError } from '../internal/deploymentSafety'
import { command, safeSegment } from './project'

export async function readDeploymentConfig(root: string, run = command) {
  const output = await run(root, 'bun', ['--eval',
    'globalThis.defineEpochConfig = c => c; ' +
    'const {version, contactEmail} = (await import("./epoch.config.ts")).default; ' +
    'console.log(JSON.stringify({version, contactEmail}))',
  ])
  const config = JSON.parse(output) as { version: string, contactEmail: string }
  const error = contactEmailError(config.contactEmail)
  if (error) throw new Error(error)
  safeSegment(config.version, 'experiment version')
  return config
}
