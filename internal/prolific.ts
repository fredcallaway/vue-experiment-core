import { z } from 'zod'
import firebaseConfig from '~/firebase.config.json'

export const PROLIFIC_FEE = 1.333333 // they say it's 33.3% ...they lie

export type EligibilityConfig = {
  allowUK?: boolean
  minSubmissions?: number
  maxSubmissions?: number
  minApprovalRate?: number
  requireEnglishFluency?: boolean
  requireEnglishPrimary?: boolean
}

export type ProlificConfig = {
  baseUrl: string
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

export const DEFAULT_PROLIFIC_CONFIG: ProlificConfig = {
  baseUrl: 'FIREBASE_DEFAULT',
  name: 'Psychology Experiment',
  description: 'I should probably put a description here...',
  estimated_completion_time: 10,
  maximum_allowed_time: 60,
  reward: 200,
  total_available_places: 5,
  eligibility: {
    allowUK: true,
    minSubmissions: 50,
    maxSubmissions: 100000,
    minApprovalRate: 99,
    requireEnglishFluency: true,
    requireEnglishPrimary: true,
  },
}

export const getProlificBaseUrl = (config: ProlificConfig): string => {
  if (config.baseUrl === 'FIREBASE_DEFAULT') {
    return `https://${firebaseConfig.projectId}.web.app/`
  }
  assert(config.baseUrl.startsWith('https://'), 'Prolific base URL must start with https://')
  return config.baseUrl
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

// e.g. 636d6ce3fb3683ff33f9e514
export const isProlificIdentifier = (str: string) => /^[a-f\d]{24}$/i.test(str)

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

// COMPLETION CODES

// all possible codes; you can add new options (but be careful about removing)
export const COMPLETION_CODE_TYPES = ['COMPLETED', 'ERROR', 'ABORTED', 'TIMEOUT', 'DISCONNECTED'] as const
export type CompletionCodeType = typeof COMPLETION_CODE_TYPES[number]

// prolific action associated with each code; can be adjusted (TODO: configure in config?)
const getCompletionActions = (codeType: CompletionCodeType) => {
  switch (codeType) {
    case 'ABORTED':
      return [{ action: 'REQUEST_RETURN', return_reason: 'Experiment was not completed.' }]
    case 'TIMEOUT':
      return [{ action: 'REQUEST_RETURN', return_reason: 'Did not begin study promptly.' }]
    default:
      return [{ action: 'MANUALLY_REVIEW' }]
  }
}

// completion code is a deterministic hash of config.version and codeType
export const getCompletionCode = (codeType: CompletionCodeType): string => {
  const config = useConfig()

  const input = `${codeType}-${config.version}`
  const hash = hashString(input)

  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let code = codeType[0] + '0' // version-independent part for easy identification
  let remaining = hash

  for (let i = 0; i < 5; i++) {
    code += chars[remaining % chars.length]
    remaining = Math.floor(remaining / chars.length)
  }

  return code
}

export const createCompletionCodes = (): CompletionCodeSpec[] => {
 return COMPLETION_CODE_TYPES.map(codeType => ({
    code_type: codeType,
    actions: getCompletionActions(codeType),
    code: getCompletionCode(codeType),
  }))
}


// ZOD SCHEMAS

export const ProlificSubmissionSchema = z.object({
  id: z.string(),
  participant_id: z.string(),
  // this status is set by prolific; the values shouldn't be changed
  status: z.enum(['ACTIVE', 'AWAITING REVIEW', 'APPROVED', 'PARTIALLY APPROVED', 'REJECTED', 'RETURNED', 'SCREENED OUT', 'TIMED-OUT', 'UNKNOWN']),
  started_at: z.string().nullable(),
  time_taken: z.number().nullable().optional(),
  study_code: z.string().nullable().optional(),
  bonus_payments: z.array(z.number()),
})

export const CompletionCodeSpecSchema = z.object({
  code: z.string(),
  code_type: z.enum(COMPLETION_CODE_TYPES),
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
  auto_rejection_categories: z.array(z.string()).optional(),
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
export type Study = StudyShort | StudyFull 

export class ProlificError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProlificError'
  }
}
