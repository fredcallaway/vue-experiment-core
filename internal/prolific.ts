import { z } from 'zod'

export type EligibilityConfig = {
  allowUK?: boolean
  minSubmissions?: number
  maxSubmissions?: number
  minApprovalRate?: number
  requireEnglishFluency?: boolean
  requireEnglishPrimary?: boolean
}

export type ProlificConfig = {
  projectId: string
  name: string
  description: string
  estimated_completion_time: number
  maximum_allowed_time: number
  reward: number
  total_available_places: number
  device_compatibility?: string[]
  eligibility?: EligibilityConfig
  filters?: {
    filter_id: string
    selected_values?: string[]
    selected_range?: { lower: number; upper: number }
  }[]
}

let _prolificConfig: ProlificConfig | null = null

export const defineProlificConfig = (config: ProlificConfig): ProlificConfig => {
  _prolificConfig = config
  return config
}

export const getProlificConfig = (): ProlificConfig => {
  if (!_prolificConfig) throw new Error('Prolific config not initialized. Import prolific.config.ts first.')
  return _prolificConfig
}

export const eligibilityToFilters = (eligibility: EligibilityConfig): Filter[] => {
  const filters: Filter[] = []

  // Country filter - "0" is UK, "1" is US
  if (eligibility.allowUK !== undefined) {
    filters.push({
      filter_id: 'current-country-of-residence',
      selected_values: eligibility.allowUK ? ['0', '1'] : ['1']
    })
  }

  // Approval numbers (submissions)
  if (eligibility.minSubmissions !== undefined || eligibility.maxSubmissions !== undefined) {
    filters.push({
      filter_id: 'approval_numbers',
      selected_range: {
        lower: eligibility.minSubmissions ?? 0,
        upper: eligibility.maxSubmissions ?? 100000
      }
    })
  }

  // Approval rate
  if (eligibility.minApprovalRate !== undefined) {
    filters.push({
      filter_id: 'approval_rate',
      selected_range: {
        lower: eligibility.minApprovalRate,
        upper: 100
      }
    })
  }

  // English fluency - "19" is English
  if (eligibility.requireEnglishFluency) {
    filters.push({
      filter_id: 'fluent-languages',
      selected_values: ['19']
    })
  }

  // Primary language - "19" is English
  if (eligibility.requireEnglishPrimary) {
    filters.push({
      filter_id: 'primary-language',
      selected_values: ['19']
    })
  }

  return filters
}


// Payload for creating studies (what gets sent to Prolific API)
export type StudyPayload = {
  name: string
  internal_name: string
  description: string
  external_study_url?: string
  prolific_id_option: string
  completion_codes: CompletionCodeSpec[]
  total_available_places: number
  estimated_completion_time: number
  maximum_allowed_time: number
  reward: number
  currency_code: string
  device_compatibility: string[]
  project: string
  filters?: Filter[]
  submissions_config?: SubmissionsConfig
  access_details?: AccessDetail[]
  study_labels?: string[]
}

// Zod Schemas

export const ProlificSubmissionSchema = z.object({
  id: z.string(),
  participant_id: z.string(),
  status: z.enum(['ACTIVE', 'AWAITING REVIEW', 'APPROVED', 'PARTIALLY APPROVED', 'REJECTED', 'RETURNED', 'SCREENED OUT', 'TIMED-OUT', 'UNKNOWN']),
  started_at: z.string().nullable(),
  time_taken: z.number().nullable().optional(),
  study_code: z.string().nullable().optional(),
  bonus_payments: z.array(z.number()),
})

export const CompletionCodeSpecSchema = z.object({
  code: z.string(),
  code_type: z.enum(['COMPLETED', 'ERROR', 'ABORTED', 'TIMEOUT']),
  actions: z.array(z.object({
    action: z.string(),
    return_reason: z.string().optional(),
  })),
})

export const FilterSchema = z.object({
  filter_id: z.string(),
  selected_values: z.array(z.string()).optional(),
  selected_range: z.object({
    lower: z.number(),
    upper: z.number(),
  }).optional(),
})

export const SubmissionsConfigSchema = z.object({
  max_submissions_per_participant: z.number(),
  max_concurrent_submissions: z.number(),
  auto_rejection_categories: z.array(z.string()),
})

export const AccessDetailSchema = z.object({
  external_url: z.string(),
  total_allocation: z.number(),
  allocated: z.number().optional(),
})

// StudyShort: What we get from list endpoints
export const ProlificStudyShortSchema = z.object({
  id: z.string(),
  name: z.string(),
  internal_name: z.string(),
  status: z.enum(['UNPUBLISHED', 'PUBLISHING', 'ACTIVE', 'SCHEDULED', 'PAUSED', 'AWAITING REVIEW', 'COMPLETED']),
  date_created: z.string(),
  published_at: z.string().nullable().optional(),
  total_available_places: z.number(),
  places_taken: z.number(),
  reward: z.number(),
  total_cost: z.number(),
})

// StudyFull: What we get from individual study endpoints
export const ProlificStudyDetailsSchema = ProlificStudyShortSchema.extend({
  estimated_completion_time: z.number(),
  completion_codes: z.array(CompletionCodeSpecSchema),
  access_details: z.array(AccessDetailSchema).nullable(),
})

// TypeScript Types
export type Submission = z.infer<typeof ProlificSubmissionSchema>
export type CompletionCodeSpec = z.infer<typeof CompletionCodeSpecSchema>
export type Filter = z.infer<typeof FilterSchema>
export type SubmissionsConfig = z.infer<typeof SubmissionsConfigSchema>
export type AccessDetail = z.infer<typeof AccessDetailSchema>
export type StudyShort = z.infer<typeof ProlificStudyShortSchema>
export type StudyDetails = z.infer<typeof ProlificStudyDetailsSchema>
export type StudyFull = StudyDetails & { submissions: Submission[] }
export type StudyStatus = StudyShort['status']
export type SubmissionStatus = Submission['status']
export type CompletionCode = CompletionCodeSpec['code_type']
export type Study = StudyShort | StudyFull 

export class ProlificError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProlificError'
  }
}

