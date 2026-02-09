import type { ProlificConfig } from '../prolific'
type StudyData = {
  sha: string
  publishTime?: number
  version: string
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

  const publishStudy = async (studyId: string) => {
    const db = useDatabase()
    await db.set(`studies/${studyId}/publishTime`, Date.now())
  }

  return {
    addStudy,
    getStudy,
    publishStudy,
  }
}
