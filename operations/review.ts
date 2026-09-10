import type { CompletionCodeSpec, Submission } from '../internal/prolific'
import type { SessionMeta } from '../internal/data'
import type { OperationsDatabase } from './database'
import type { ProlificReader } from './prolific-reader'

export type ReviewDataStatus = 'missing' | 'minimal' | 'partial' | 'full'
export type ReviewDefaultAction = 'approve' | 'none' | null

export const getCompletionCodeType = (
  studyCode: string | null | undefined,
  completionCodes: CompletionCodeSpec[],
) => {
  if (!studyCode) return 'NOCODE'
  if (studyCode === 'Manual Completion') return 'MANUAL'
  return completionCodes.find(item => item.code === studyCode)?.code_type ?? studyCode
}

export const getReviewDataStatus = (
  submission: Submission,
  session: SessionMeta | undefined,
  completionCodes: CompletionCodeSpec[],
): ReviewDataStatus => {
  if (!session) return 'missing'
  if (!session.noReturnTime) {
    const codeType = getCompletionCodeType(submission.study_code, completionCodes)
    if (codeType === 'COMPLETED' && session.completionTime) return 'full'
    return 'minimal'
  }
  if (!session.completionTime) return 'partial'
  return 'full'
}

export const getDefaultReviewAction = (
  submission: Submission,
  dataStatus: ReviewDataStatus,
  completionCodes: CompletionCodeSpec[],
): ReviewDefaultAction => {
  const codeType = getCompletionCodeType(submission.study_code, completionCodes)
  if (codeType === 'COMPLETED' && dataStatus === 'full') return 'approve'
  if (submission.status === 'RETURNED' && dataStatus !== 'full') return 'none'
  return null
}

export const getOutstandingBonusCents = (
  submissions: Pick<Submission, 'participant_id' | 'bonus_payments'>[],
  intendedBonuses: Record<string, number>,
) => submissions.reduce((total, submission) => {
  const paid = submission.bonus_payments.reduce((sum, amount) => sum + amount, 0)
  const intended = intendedBonuses[submission.participant_id] ?? 0
  return total + Math.max(intended - paid, 0)
}, 0)

const getSessionStatus = (session: SessionMeta, now: number) => {
  if (session.error) return 'error'
  if (session.completionTime) return 'completed'
  const minutesSinceUpdate = (now - session.lastUpdateTime) / 60_000
  if (minutesSinceUpdate < 1) return 'active'
  if (minutesSinceUpdate < 30) return 'idle'
  return 'quit'
}

export class ReviewOperations {
  constructor(
    private readonly database: OperationsDatabase,
    private readonly prolific: ProlificReader,
    private readonly now = () => Date.now(),
  ) {}

  async inspect(studyId: string, submissionId?: string) {
    const [study, allSessions] = await Promise.all([
      this.prolific.getStudy(studyId),
      this.database.get<Record<string, SessionMeta>>('live/meta'),
    ])
    const sessions = Object.values(allSessions ?? {}).filter(session => session.studyId === studyId)
    const sessionsById = Object.fromEntries(sessions.map(session => [session.sessionId, session]))
    const submissions = submissionId
      ? study.submissions.filter(submission => submission.id === submissionId)
      : study.submissions
    if (submissionId && submissions.length === 0) throw new Error(`Submission not found: ${submissionId}`)

    const rows = submissions.map((submission) => {
      const session = sessionsById[submission.id]
      const dataStatus = getReviewDataStatus(submission, session, study.completion_codes)
      const defaultAction = getDefaultReviewAction(submission, dataStatus, study.completion_codes)
      return {
        submissionId: submission.id,
        participantId: submission.participant_id,
        submissionStatus: submission.status,
        completionCodeType: getCompletionCodeType(submission.study_code, study.completion_codes),
        dataStatus,
        defaultAction,
        needsManualReview: defaultAction === null,
        bonusPaidCents: submission.bonus_payments.reduce((total, amount) => total + amount, 0),
        session: session ? {
          status: getSessionStatus(session, this.now()),
          version: session.version,
          startTime: session.startTime,
          noReturnTime: session.noReturnTime ?? null,
          completionTime: session.completionTime ?? null,
          lastUpdateTime: session.lastUpdateTime,
          error: session.error ?? null,
          intendedBonusCents: Math.round(session.bonus * 100),
        } : null,
      }
    })

    return {
      study: {
        id: study.id,
        internalName: study.internal_name,
        status: study.status,
      },
      summary: {
        submissions: rows.length,
        defaultApprovals: rows.filter(row => row.defaultAction === 'approve').length,
        manualReview: rows.filter(row => row.needsManualReview).length,
      },
      submissions: rows,
    }
  }
}
