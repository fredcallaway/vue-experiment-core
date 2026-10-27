#!/usr/bin/env bun
import { assertFirebaseProjectMatchesCli } from './firebase-project'
import { FirebaseRestDatabase } from './database'
import { DeploymentOperations } from './deployment'
import { withOperationLock } from './project'
import { readDeploymentConfig } from './experiment-config'

try {
  const args = process.argv.slice(2).filter(arg => arg !== '--')
  if (args.some(arg => arg !== '--allow-version-reuse')) throw new Error('Unknown deployment option')
  const root = process.cwd()
  await readDeploymentConfig(root)
  await assertFirebaseProjectMatchesCli(root)
  const database = await FirebaseRestDatabase.fromProject(root)
  const operations = new DeploymentOperations(root, database)
  const result = await withOperationLock(root, () => operations.deploy({
    allowVersionReuse: args.includes('--allow-version-reuse'),
  }))
  console.log(JSON.stringify(result, null, 2))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
