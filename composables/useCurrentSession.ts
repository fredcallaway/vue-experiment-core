export const parseUrlParams = createGlobalState(() => {
  const urlParams = new URLSearchParams(window.location.search)

  const sessionId = urlParams.get('session_id') || urlParams.get('SESSION_ID')
  if (sessionId == '_meta') {
    throw new Error('session_id cannot be _meta')
  }
  const illegal = '.#$[]/'.split('')
  if (sessionId && illegal.some(char => sessionId.includes(char))) {
    throw new Error(`session_id "${sessionId}" contains illegal characters ( .#$[]/ )`)
  }
  if (sessionId == "{{%SESSION_ID%}}") {
    throw new Error('session_id is the prolific placeholder: {{%SESSION_ID%}})')
  }

  const participantId = urlParams.get('participant_id') || urlParams.get('PROLIFIC_PID')
  const studyId = urlParams.get('study_id') || urlParams.get('STUDY_ID')
  const mode = urlParams.get('mode')
  const assignment = getUrlNumber('assignment') ?? getUrlNumber('condition')
  
  if (mode && !['debug', 'live'].includes(mode)) {
    throw new Error(`url parameter "mode" must be "debug" or "live", got "${mode}"`)
  }

  return {
    sessionId,
    participantId,
    studyId,
    assignment,
    mode: mode ? assertOneOf<DataMode>(mode, ['debug', 'live']) : null,
  }
})

export const useCurrentSession = createGlobalState<() => SessionMeta>(() => {
  const parsed = parseUrlParams()
  
  const sessionId = parsed.sessionId ?? (() => {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    const hours = String(now.getHours()).padStart(2, '0')
    const minutes = String(now.getMinutes()).padStart(2, '0')
    const seconds = String(now.getSeconds()).padStart(2, '0')
    return `UNKNOWN-${year}${month}${day}-${hours}${minutes}${seconds}`
  })()
  const participantId = parsed.participantId || 'UNKNOWN'
  const studyId = parsed.studyId || 'UNKNOWN'
  const assignment = parsed.assignment ?? undefined  // set in useConditions

  let mode: DataMode
  if (parsed.mode) {
    mode = parsed.mode
  } else {
    mode = (studyId != 'UNKNOWN' || participantId != 'UNKNOWN') ? 'live' : 'debug'
    console.log(`inferred mode="${mode}" from studyId="${studyId}" and participantId="${participantId}"`)
  }

  const meta: SessionMeta = {
    sessionId,
    participantId,
    studyId,
    mode,
    version: useConfig().version,
    startTime: START_TIME,
    lastUpdateTime: Date.now(),
    bonus: 0,
    assignment,
  }

  return reactive(meta)
})