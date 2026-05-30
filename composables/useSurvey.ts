export type SurveyPrompt = string | {
  prompt: string
  flags?: string[]
}

export type ParsedSurveyPrompt = {
  question: string
  flags: string[]
}

export type SurveyResponse = {
  question: string
  response: string
  rt: number
  flags: string[]
  numericResponse?: number
  maxResponse?: number
}

export const [logSurveyResponse, isSurveyResponse] = declareEventLogger<SurveyResponse>('survey.response')

export function parseSurveyPrompt(raw: string): ParsedSurveyPrompt {
  const match = raw.match(/^\[([\w\d_\s]+)\]\s*(.*)$/)
  if (!match) return { question: raw, flags: [] }
  const flags = match[1].split(/\s+/).filter(f => f.length > 0)
  return { question: match[2], flags }
}

export function normalizeSurveyPrompt(prompt: SurveyPrompt): ParsedSurveyPrompt {
  if (typeof prompt === 'string') return parseSurveyPrompt(prompt)
  const parsed = parseSurveyPrompt(prompt.prompt)
  return { question: parsed.question, flags: [...parsed.flags, ...(prompt.flags ?? [])] }
}

export function normalizeSurveyOptions(options: string | string[]) {
  return Array.isArray(options) ? options : string2array(options)
}

export function parseSurveyResponses(sessionData: SessionData) {
  return R.pipe(
    sessionData.events,
    R.filter(isSurveyResponse),
    R.map((event) => {
      const row = {
        epochId: event.currentEpochId,
        question: event.data.question,
        response: event.data.response,
        rt: event.data.rt,
        flags: event.data.flags ?? [],
      }

      return R.isDefined(event.data.numericResponse)
        ? {
            ...row,
            numericResponse: event.data.numericResponse,
            maxResponse: event.data.maxResponse,
          }
        : row
    }),
  )
}

declareDataView('survey', parseSurveyResponses)
