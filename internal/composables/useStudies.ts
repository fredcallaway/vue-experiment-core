import { ref as dbRef, get, set } from 'firebase/database'

type StudyData = {
  sha: string
  publishTime: number
  version: string
  completionCodes: Record<string, string>
}

export const addStudy = async (studyId: string, data: StudyData) => {
  const db = useDatabase()
  await set(dbRef(db, `studies/${studyId}/`), data)
}

export const getStudy = async (studyId: string): Promise<StudyData | null> => {
  const db = useDatabase()
  const studyRef = dbRef(db, `studies/${studyId}/`)
  const snapshot = await get(studyRef)
  return snapshot.val() || null
}