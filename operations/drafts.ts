import { z } from 'zod'
import {
  DEFAULT_PROLIFIC_CONFIG,
  ProlificConfigSchema,
  isProlificIdentifier,
  type ProlificConfig,
} from '../internal/prolific'
import type { ProlificReviewAction } from '../internal/composables/useProlificReviewDraft'
import type { OperationsDatabase } from './database'

const ReviewActionSchema = z.enum(['approve', 'return', 'reject', 'none'])
const ProlificIdSchema = z.string().refine(isProlificIdentifier, 'Expected a 24-character Prolific ID')
const ReviewDraftSchema = z.object({
  actionOverrides: z.record(ProlificIdSchema, ReviewActionSchema).default({}),
  bonusOverrides: z.record(ProlificIdSchema, z.number().int().min(0).max(2_000)).default({}),
})
const ReviewDraftPatchSchema = z.object({
  actionOverrides: z.record(ProlificIdSchema, ReviewActionSchema.nullable()).optional(),
  bonusOverrides: z.record(ProlificIdSchema, z.number().int().min(0).max(2_000).nullable()).optional(),
}).strict()

export type ReviewDraft = {
  actionOverrides: Record<string, ProlificReviewAction>
  bonusOverrides: Record<string, number>
}
export type ReviewDraftPatch = z.infer<typeof ReviewDraftPatchSchema>

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

const mergeDeep = (base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> => {
  const result = structuredClone(base)
  for (const [key, value] of Object.entries(patch)) {
    const current = result[key]
    result[key] = isPlainObject(current) && isPlainObject(value)
      ? mergeDeep(current, value)
      : structuredClone(value)
  }
  return result
}

const flattenPatch = (patch: Record<string, unknown>, prefix = ''): Record<string, unknown> => {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(patch)) {
    const path = prefix ? `${prefix}/${key}` : key
    if (isPlainObject(value)) {
      Object.assign(result, flattenPatch(value, path))
    } else {
      result[path] = value
    }
  }
  return result
}

export class DraftOperations {
  constructor(private readonly database: OperationsDatabase) {}

  async getStudyDraft(): Promise<ProlificConfig> {
    const stored = await this.database.get<Record<string, unknown>>('studyDraft') ?? {}
    return ProlificConfigSchema.parse(mergeDeep(DEFAULT_PROLIFIC_CONFIG, stored))
  }

  async updateStudyDraft(patch: unknown): Promise<ProlificConfig> {
    if (!isPlainObject(patch)) throw new Error('Study draft patch must be a JSON object')
    const current = await this.getStudyDraft()
    ProlificConfigSchema.parse(mergeDeep(current, patch))
    const updates = flattenPatch(patch)
    if (Object.keys(updates).length > 0) await this.database.update('studyDraft', updates)
    return await this.getStudyDraft()
  }

  async getReviewDraft(studyId: string): Promise<ReviewDraft> {
    ProlificIdSchema.parse(studyId)
    const stored = await this.database.get<unknown>(`studies/${studyId}/reviewDraft`)
    return ReviewDraftSchema.parse(stored ?? {})
  }

  async updateReviewDraft(studyId: string, input: unknown): Promise<ReviewDraft> {
    ProlificIdSchema.parse(studyId)
    const patch = ReviewDraftPatchSchema.parse(input)
    const updates: Record<string, unknown> = {}
    for (const [submissionId, action] of Object.entries(patch.actionOverrides ?? {})) {
      updates[`actionOverrides/${submissionId}`] = action
    }
    for (const [participantId, bonus] of Object.entries(patch.bonusOverrides ?? {})) {
      updates[`bonusOverrides/${participantId}`] = bonus
    }
    if (Object.keys(updates).length > 0) {
      await this.database.update(`studies/${studyId}/reviewDraft`, updates)
    }
    return await this.getReviewDraft(studyId)
  }
}
