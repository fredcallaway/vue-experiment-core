import { useDatabase } from '../../composables/useDatabase'
import { useConfig } from '../../composables/useConfig'
import { contactEmailError, versionWarnings } from '../deploymentSafety'

import type { ProlificConfig } from '../prolific'
type StudyData = {
  sha: string
  publishTime?: number
  version: string
  deploymentId?: string
  completionCodes: Record<string, string>
  prolificConfig?: ProlificConfig
}

export const useStudies = () => {

  const addStudy = async (studyId: string, data: StudyData) => {
    const db = useDatabase()
    await db.set(`studies/${studyId}/`, data)
  }

  const getStudy = async (studyId: string): Promise<StudyData | null> => {
    const db = useDatabase()
    const snapshot = await db.get(`studies/${studyId}/`)
    return snapshot?.val() || null
  }

  const preparePublication = async (studyId: string) => {
    const db = useDatabase()
    const config = useConfig()
    const error = contactEmailError(config.contactEmail)
    if (error) throw new Error(error)
    const study = await getStudy(studyId)
    const deployed = (await db.get('deployStatus')).val()
    const selected = (await db.get('deploymentVersion')).val()
    if (!study || !deployed?.sha || deployed.version !== study.version || (selected && selected !== study.version)) {
      throw new Error('The draft version must match the selected dataset version and deployment. Deploy and recreate the draft.')
    }
    const deployment = { version: deployed.version as string, sha: (deployed.fullSha || deployed.sha) as string,
      ...(deployed.id ? { deploymentId: deployed.id as string } : {}) }
    const studies = (await db.get('studies')).val()
    return { deployment, warnings: versionWarnings(deployment.version, deployment.sha, studies) }
  }

  const publishStudy = async (studyId: string, deployment: { version: string, sha: string, deploymentId?: string }) => {
    const db = useDatabase()
    await db.update(`studies/${studyId}`, { ...deployment, publishTime: Date.now() })
  }

  return {
    addStudy,
    getStudy,
    preparePublication,
    publishStudy,
  }
}
