import { assertFirebaseProjectMatchesCli } from '../../../operations/firebase-project'
import { FirebaseRestDatabase } from '../../../operations/database'
import { DeploymentOperations } from '../../../operations/deployment'
import { readDeploymentConfig } from '../../../operations/experiment-config'
import { withOperationLock } from '../../../operations/project'
import { hostingVerification } from '../../utils/hostingVerification'

export default defineEventHandler(async (event) => {
  try {
    const root = process.cwd()
    await readDeploymentConfig(root)
    await assertFirebaseProjectMatchesCli(root)
    const body = await readBody(event)
    const database = await FirebaseRestDatabase.fromProject(root)
    const operations = new DeploymentOperations(root, database)
    const result = await withOperationLock(root, async () => {
      try {
        return await operations.deploy({
          version: body?.version,
          allowVersionReuse: body?.allowVersionReuse === true,
          allowLiveStudies: Array.isArray(body?.allowLiveStudies) ? body.allowLiveStudies : [],
        }, () => { hostingVerification.pending = true })
      } finally {
        hostingVerification.pending = false
      }
    })
    return { success: true as const, ...result }
  } catch (error) {
    return { success: false as const, error: error instanceof Error ? error.message : String(error) }
  }
})
