import { FirebaseRestDatabase } from '../../../operations/database'
import { DeploymentOperations } from '../../../operations/deployment'

export default defineEventHandler(async () => {
  const root = process.cwd()
  const database = await FirebaseRestDatabase.fromProject(root)
  return await new DeploymentOperations(root, database).getActiveStudies()
})
