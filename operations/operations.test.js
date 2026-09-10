import { describe, expect, test } from 'bun:test'
import { DraftOperations } from './drafts'
import { MockProlificReader } from './prolific-reader'
import {
  getMissingApprovedAssignmentCounts,
  getOutstandingBonusCents,
  getStudyDisplayStatus,
  partitionApprovedSubmissionsBySession,
  ReviewOperations,
} from './review'

const STUDY_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa'
const SUBMISSION_1 = '111111111111111111111111'
const SUBMISSION_2 = '222222222222222222222222'
const PARTICIPANT_1 = 'bbbbbbbbbbbbbbbbbbbbbbbb'
const PARTICIPANT_2 = 'cccccccccccccccccccccccc'

class MemoryDatabase {
  updates = []

  constructor(root = {}) {
    this.root = root
  }

  async get(path) {
    let current = this.root
    for (const segment of path.split('/').filter(Boolean)) {
      current = current?.[segment]
    }
    return current === undefined ? null : structuredClone(current)
  }

  async update(path, updates) {
    this.updates.push({ path, values: structuredClone(updates) })
    for (const [relativePath, value] of Object.entries(updates)) {
      const segments = [...path.split('/'), ...relativePath.split('/')].filter(Boolean)
      let parent = this.root
      for (const segment of segments.slice(0, -1)) {
        parent[segment] ??= {}
        parent = parent[segment]
      }
      const key = segments.at(-1)
      if (value === null) delete parent[key]
      else parent[key] = structuredClone(value)
    }
  }
}

const studyFixture = () => ({
  id: STUDY_ID,
  name: 'Mock study',
  internal_name: 'mock-v1',
  status: 'AWAITING REVIEW',
  date_created: '2026-09-04T12:00:00Z',
  total_available_places: 2,
  places_taken: 2,
  reward: 200,
  total_cost: 400,
  estimated_completion_time: 10,
  completion_codes: [{ code: 'C0DONE', code_type: 'COMPLETED', actions: [{ action: 'MANUALLY_REVIEW' }] }],
  access_details: null,
  submissions: [
    {
      id: SUBMISSION_1,
      participant_id: PARTICIPANT_1,
      status: 'AWAITING REVIEW',
      started_at: '2026-09-04T12:00:00Z',
      study_code: 'C0DONE',
      bonus_payments: [],
    },
    {
      id: SUBMISSION_2,
      participant_id: PARTICIPANT_2,
      status: 'AWAITING REVIEW',
      started_at: '2026-09-04T12:05:00Z',
      study_code: 'C0DONE',
      bonus_payments: [],
    },
  ],
})

const session = overrides => ({
  sessionId: SUBMISSION_1,
  participantId: PARTICIPANT_1,
  studyId: STUDY_ID,
  version: 'mock-v1',
  mode: 'live',
  startTime: 1_000,
  noReturnTime: 2_000,
  completionTime: 3_000,
  lastUpdateTime: 3_000,
  bonus: 1.25,
  assignment: 0,
  ...overrides,
})

describe('review helpers', () => {
  test('shows pending while unpaid bonuses are being executed', () => {
    expect(getStudyDisplayStatus('COMPLETED', false, true)).toBe('AWAITING REVIEW')
    expect(getStudyDisplayStatus('COMPLETED', true, true)).toBe('PENDING')
    expect(getStudyDisplayStatus('COMPLETED', true, false)).toBe('COMPLETED')
  })

  test('counts outstanding bonuses per participant', () => {
    const submissions = studyFixture().submissions
    submissions[0].bonus_payments = [150]
    submissions[1].bonus_payments = [25]

    expect(getOutstandingBonusCents(submissions, {
      [PARTICIPANT_1]: 100,
      [PARTICIPANT_2]: 100,
    })).toBe(75)
  })

  test('ignores zero and fully paid bonuses', () => {
    const submissions = studyFixture().submissions
    submissions[0].bonus_payments = [100]

    expect(getOutstandingBonusCents(submissions, {
      [PARTICIPANT_1]: 100,
      [PARTICIPANT_2]: 0,
    })).toBe(0)
  })

  test('separates approved submissions that have no session metadata', () => {
    const submissions = studyFixture().submissions
    submissions[0].status = 'APPROVED'
    submissions[1].status = 'APPROVED'

    const result = partitionApprovedSubmissionsBySession(submissions, {
      [SUBMISSION_1]: session({}),
    })

    expect(result.matched.map(item => item.submission.id)).toEqual([SUBMISSION_1])
    expect(result.missing.map(item => item.id)).toEqual([SUBMISSION_2])
  })

  test('infers the assignment of an approved submission with missing metadata', () => {
    const submissions = studyFixture().submissions
    submissions[0].status = 'APPROVED'
    submissions[1].status = 'APPROVED'

    const result = getMissingApprovedAssignmentCounts(
      submissions,
      { [SUBMISSION_1]: session({ assignment: 0 }) },
      [
        { external_url: 'https://example.com?assignment=0', total_allocation: 1, allocated: 1 },
        { external_url: 'https://example.com?assignment=1', total_allocation: 1, allocated: 1 },
      ],
    )

    expect(result).toEqual({ 1: 1 })
  })

  test('does not infer missing approved assignments when allocation data is ambiguous', () => {
    const submissions = studyFixture().submissions
    submissions[0].status = 'APPROVED'
    submissions[1].status = 'APPROVED'

    const result = getMissingApprovedAssignmentCounts(
      submissions,
      { [SUBMISSION_1]: session({ assignment: 0 }) },
      [
        { external_url: 'https://example.com?assignment=0', total_allocation: 1, allocated: 1 },
        { external_url: 'https://example.com?assignment=1', total_allocation: 1, allocated: 1 },
        { external_url: 'https://example.com?assignment=2', total_allocation: 1, allocated: 1 },
      ],
    )

    expect(result).toEqual({})
  })
})

describe('draft operations', () => {
  test('updates one study-draft leaf without dropping defaults or siblings', async () => {
    const database = new MemoryDatabase({ studyDraft: { reward: 250, eligibility: { allowUK: false } } })
    const operations = new DraftOperations(database)

    const updated = await operations.updateStudyDraft({ eligibility: { minApprovalRate: 98 } })

    expect(updated.reward).toBe(250)
    expect(updated.eligibility?.allowUK).toBe(false)
    expect(updated.eligibility?.minApprovalRate).toBe(98)
    expect(database.updates).toEqual([{
      path: 'studyDraft',
      values: { 'eligibility/minApprovalRate': 98 },
    }])
  })

  test('updates and deletes exact review-draft leaves', async () => {
    const database = new MemoryDatabase({
      studies: {
        [STUDY_ID]: {
          reviewDraft: {
            actionOverrides: { [SUBMISSION_1]: 'approve' },
            bonusOverrides: { [PARTICIPANT_1]: 100 },
          },
        },
      },
    })
    const operations = new DraftOperations(database)

    const updated = await operations.updateReviewDraft(STUDY_ID, {
      actionOverrides: { [SUBMISSION_1]: null, [SUBMISSION_2]: 'return' },
      bonusOverrides: { [PARTICIPANT_2]: 75 },
    })

    expect(updated).toEqual({
      actionOverrides: { [SUBMISSION_2]: 'return' },
      bonusOverrides: { [PARTICIPANT_1]: 100, [PARTICIPANT_2]: 75 },
    })
  })

  test('rejects invalid review values before writing', async () => {
    const database = new MemoryDatabase()
    const operations = new DraftOperations(database)

    await expect(operations.updateReviewDraft(STUDY_ID, {
      bonusOverrides: { [PARTICIPANT_1]: 1.5 },
    })).rejects.toThrow()
    expect(database.updates).toHaveLength(0)
  })
})

describe('review investigation', () => {
  test('joins Prolific submissions to session metadata without mutations', async () => {
    const database = new MemoryDatabase({
      live: {
        meta: {
          [SUBMISSION_1]: session({}),
          [SUBMISSION_2]: session({
            sessionId: SUBMISSION_2,
            participantId: PARTICIPANT_2,
            completionTime: undefined,
          }),
        },
      },
    })
    const prolific = new MockProlificReader({ [STUDY_ID]: studyFixture() })
    const operations = new ReviewOperations(database, prolific, () => 4_000)

    const result = await operations.inspect(STUDY_ID)

    expect(result.summary).toEqual({ submissions: 2, defaultApprovals: 1, manualReview: 1 })
    expect(result.submissions[0]).toMatchObject({ dataStatus: 'full', defaultAction: 'approve' })
    expect(result.submissions[1]).toMatchObject({ dataStatus: 'partial', defaultAction: null })
    expect(prolific.calls).toEqual([STUDY_ID])
    expect(database.updates).toHaveLength(0)
  })
})
