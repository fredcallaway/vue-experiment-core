interface Message {
  body: string
  timestamp: number
  isResearcher: boolean
}

export interface Correspondence {
  studyId: string
  participantId: string
  resolved: boolean
  timestamp: number
  messages: readonly Message[]
}

interface ProlificMessage {
  id: string
  body: string
  datetime_created: string
  sender_id: string
  data: {
    study_id: string
  }
}

const RESEARCHER_ID_KEY = 'prolific_researcher_id'
const REFRESH_TIME_PATH = '/messagesRefreshTime'
const MESSAGES_PATH = '/messages'

export const useProlificMessages = createGlobalState(() => {
  const prolific = useProlific()
  const db = useDatabase()

  const correspondences = ref<Record<string, Correspondence>>({})
  const isLoading = ref(false)
  const lastRefreshTimestamp = ref<number | null>(null)

  // Load correspondences from database
  // TODO: we're using the DB for local state management FIX
  db.onValue(MESSAGES_PATH, (snap) => {
    correspondences.value = snap.val() || {}
  })

  // Load last refresh time from database
  db.onValue(REFRESH_TIME_PATH, (snap) => {
    const val = snap.val()
    lastRefreshTimestamp.value = val ? new Date(val).getTime() : null
  })

  const getResearcherId = async (): Promise<string> => {
    const cached = localStorage.getItem(RESEARCHER_ID_KEY)
    if (cached) return cached

    const response = await prolific.request<{ id: string }>('GET', '/users/me')
    localStorage.setItem(RESEARCHER_ID_KEY, response.id)
    return response.id
  }

  const getLastRefreshTime = async (): Promise<string | null> => {
    const snap = await db.get(REFRESH_TIME_PATH)
    return snap.val()
  }

  const setLastRefreshTime = async (time: string) => {
    await db.set(REFRESH_TIME_PATH, time)
  }

  const getStudyIds = (): Set<string> => {
    return new Set(prolific.studyList.value.items.value.map(s => s.id))
  }

  const fetchUserMessages = async (participantId: string): Promise<ProlificMessage[]> => {
    const response = await prolific.request<{ results: ProlificMessage[] }>(
      'GET',
      `/messages?user_id=${participantId}`
    )
    return response.results
  }

  const buildCorrespondence = (
    studyId: string,
    participantId: string,
    messages: ProlificMessage[],
    researcherId: string,
    existingResolved?: boolean
  ): Correspondence => {
    const sortedMessages = R.sortBy(messages, m => new Date(m.datetime_created).getTime())
    return {
      studyId,
      participantId,
      resolved: existingResolved ?? false,
      timestamp: sortedMessages.length > 0 
        ? new Date(sortedMessages[sortedMessages.length - 1].datetime_created).getTime()
        : Date.now(),
      messages: sortedMessages.map(m => ({
        body: m.body,
        timestamp: new Date(m.datetime_created).getTime(),
        isResearcher: m.sender_id === researcherId
      }))
    }
  }

  const refresh = async () => {
    isLoading.value = true
    try {
      const [researcherId, lastRefresh] = await Promise.all([
        getResearcherId(),
        getLastRefreshTime()
      ])

      const studyIds = getStudyIds()
      const createdAfter = lastRefresh ?? new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString()
      const response = await prolific.request<{ results: ProlificMessage[] }>(
        'GET',
        `/messages?created_after=${createdAfter}`
      )

      // Filter to messages from our studies, sent by participants (not researcher)
      // NOTE: prolific does not provide the recipient_id so we can't process
      // those (annoying!)
      const newMessages = response.results.filter(m => 
        studyIds.has(m.data.study_id) && m.sender_id !== researcherId
      )

      // Group by study + participant
      const grouped = R.groupBy(newMessages, m => {
        // Need to get participant ID - the sender_id for participant messages
        return `${m.data.study_id}-${m.sender_id}`
      })

      // Update correspondences
      for (const [key, messages] of Object.entries(grouped)) {
        const studyId = messages[0].data.study_id
        const participantId = messages[0].sender_id
        if (!isProlificIdentifier(studyId)) {
          console.error('Invalid study ID', studyId)
          continue
        }
        if (!isProlificIdentifier(participantId)) {
          console.error('Invalid participant ID', participantId)
          continue
        }
        
        // Fetch complete message history for this user
        const allUserMessages = await fetchUserMessages(participantId)
        const studyMessages = allUserMessages.filter(m => m.data.study_id === studyId)
        
        const hasParticipantMessages = studyMessages.some(m => m.sender_id === participantId)
        const correspondence = buildCorrespondence(
          studyId,
          participantId,
          studyMessages,
          researcherId,
          !hasParticipantMessages
        )
        
        await db.set(`${MESSAGES_PATH}/${key}`, correspondence)
      }

      // Update refresh time
      await setLastRefreshTime(new Date().toISOString())
    } finally {
      isLoading.value = false
    }
  }

  const refreshCorrespondence = async (studyId: string, participantId: string) => {
    console.debug('refreshCorrespondence', studyId, participantId)
    // await timeoutPromise(5000) // DEBUG simulate delay
    const researcherId = await getResearcherId()
    const allMessages = await fetchUserMessages(participantId)
    const studyMessages = allMessages.filter(m => m.data.study_id === studyId)
    
    const key = `${studyId}-${participantId}`
    const existing = correspondences.value[key]
    const hasParticipantMessages = studyMessages.some(m => m.sender_id === participantId)
    const correspondence = buildCorrespondence(
      studyId,
      participantId,
      studyMessages,
      researcherId,
      existing?.resolved ?? !hasParticipantMessages
    )
    
    await db.set(`${MESSAGES_PATH}/${key}`, correspondence)
    // TODO: should update local state here
  }

  const sendMessage = async (studyId: string, participantId: string, body: string) => {
    await prolific.request('POST', '/messages/', {
      recipient_id: participantId,
      body,
      study_id: studyId
    })
    
    // Refresh to get updated messages
    await refreshCorrespondence(studyId, participantId)
  }

  const markResolved = async (studyId: string, participantId: string, resolved = true) => {
    const key = `${studyId}-${participantId}`
    await db.update(`${MESSAGES_PATH}/${key}`, { resolved })
  }

  const getCorrespondence = (studyId: string, participantId: string) => {
    const key = `${studyId}-${participantId}`
    return correspondences.value[key] ?? null
  }

  const getOrCreateCorrespondence = async (studyId: string, participantId: string): Promise<Correspondence> => {
    const key = `${studyId}-${participantId}`
    const existing = correspondences.value[key]
    if (existing) return existing
    
    const emptyCorrespondence: Correspondence = {
      studyId,
      participantId,
      resolved: false, // TODO: this should come from DB
      timestamp: 0,
      messages: []
    }
    correspondences.value = { ...correspondences.value, [key]: emptyCorrespondence }

    refreshCorrespondence(studyId, participantId)

    return emptyCorrespondence
  }

  return {
    correspondences: readonly(correspondences),
    isLoading: readonly(isLoading),
    lastRefreshTimestamp: readonly(lastRefreshTimestamp),
    refresh,
    refreshCorrespondence,
    sendMessage,
    markResolved,
    getCorrespondence,
    getOrCreateCorrespondence
  }
})

