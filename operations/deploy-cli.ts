#!/usr/bin/env -S node --import tsx
import { assertFirebaseProjectMatchesCli } from './firebase-project'
import { FirebaseRestDatabase } from './database'
import { DeploymentOperations } from './deployment'
import { withOperationLock } from './project'
import { readDeploymentConfig } from './experiment-config'

try {
  const args = process.argv.slice(2).filter(arg => arg !== '--')
  const confirmationIndex = args.indexOf('--allow-live-studies')
  const allowLiveStudies = confirmationIndex === -1 ? undefined : args[confirmationIndex + 1]?.split(',')
  if (confirmationIndex !== -1) {
    if (!allowLiveStudies?.every(id => id && !id.startsWith('--'))) throw new Error('Supply confirmed study IDs')
    args.splice(confirmationIndex, 2)
  }
  if (args.some(arg => arg !== '--allow-version-reuse')) throw new Error('Unknown deployment option')
  const root = process.cwd()
  await readDeploymentConfig(root)
  await assertFirebaseProjectMatchesCli(root)
  const database = await FirebaseRestDatabase.fromProject(root)
  const operations = new DeploymentOperations(root, database)
  const result = await withOperationLock(root, () => operations.deploy({
    allowVersionReuse: args.includes('--allow-version-reuse'),
    allowLiveStudies,
  }))
  console.log(JSON.stringify(result, null, 2))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
