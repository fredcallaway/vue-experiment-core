import { contactEmailError } from '../internal/deploymentSafety'
import { command } from './project'

export async function readDeploymentConfig(root: string, run = command, { skipContactEmailCheck = false } = {}) {
  const output = await run(root, 'bun', ['--eval',
    'globalThis.defineEpochConfig = c => c; ' +
    'const {contactEmail} = (await import("./epoch.config.ts")).default; ' +
    'console.log(JSON.stringify({contactEmail}))',
  ])
  const config = JSON.parse(output) as { contactEmail: string }
  const error = contactEmailError(config.contactEmail)
  if (error && !skipContactEmailCheck) throw new Error(error)
  if (error) console.warn('WARNING: Skipping the researcher contact-email check for this build/deployment.')
  return config
}
