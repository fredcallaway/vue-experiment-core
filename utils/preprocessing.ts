export const toWideFormat = <T extends Record<string, any>>(items: T[], key: keyof T, value: keyof T) => {
  return R.pipe(
    items,
    R.pullObject(x => x[key], x => x[value]),
    x => ([x])
  )
}

export type SurveyResponse = {
  id: string
  question: string
  response: string
  rt: number
}

function hasEpochSegment(epochId: string, name: string) {
  return epochId
    .split('-')
    .some(segment => segment === name || segment.startsWith(`${name}[`))
}

function lastEpochSegment(epochId: string) {
  return assertDefined(epochId.split('-').at(-1), `epoch id has no final segment: ${epochId}`)
}

function columnNameFromQuestion(question: string) {
  return question
    .toLowerCase()
    .replace(/[^\w\d]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export function getSurveyResponses(sessionData: SessionData, surveyName: string): SurveyResponse[] {
  const events = sessionData.events
    .filter(event => event.eventType === 'survey.response' && hasEpochSegment(event.currentEpochId, surveyName))
  const componentCounts = R.countBy(events, event => lastEpochSegment(event.currentEpochId))

  return events.map((event) => {
    const componentName = lastEpochSegment(event.currentEpochId)
    const response = event.data.response
    const question = event.data.question
    const rt = event.data.rt

    if (typeof response !== 'string') {
      throw new Error(`survey.response for ${componentName} must have a string response`)
    }
    if (typeof question !== 'string') {
      throw new Error(`survey.response for ${componentName} must have a string question`)
    }
    if (typeof rt !== 'number') {
      throw new Error(`survey.response for ${componentName} must have a numeric rt`)
    }

    const id = componentCounts[componentName] === 1
      ? componentName
      : `${componentName}_${columnNameFromQuestion(question)}`

    return {
      id,
      question,
      response: response === 'SKIP' ? '' : response,
      rt,
    }
  })
}
