import { useDatabase } from '../../composables/useDatabase'
import { R } from '../../utils/remeda-extensions'
import { isProlificIdentifier } from '../prolific'
import { useProlific } from './useProlific'
import { createGlobalState } from '@vueuse/core'
import { ref, readonly } from 'vue'

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
// Stay inside Prolific's 30-day limit, allowing for clock skew and request delays.
const MESSAGE_LOOKBACK_MS = 29 * 24 * 60 * 60 * 1000

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

  const buildCorrespondence = async (
    studyId: string,
    participantId: string,
    messages: ProlificMessage[],
    researcherId: string,
    existingResolved?: boolean
  ): Promise<Correspondence> => {
    const snap = await db.get(`${MESSAGES_PATH}/${studyId}-${participantId}`)
    const existing: Correspondence | null = snap.val()
    const merged = [...(existing?.messages ?? [])]
    // Cached messages do not store API IDs. Match occurrences by their stored fields
    // so overlapping refreshes neither duplicate history nor erase identical messages.
    const remaining = new Map<string, number>()
    const messageKey = (m: Message) => JSON.stringify([m.timestamp, m.isResearcher, m.body])
    for (const message of merged) {
      const key = messageKey(message)
      remaining.set(key, (remaining.get(key) ?? 0) + 1)
    }
    for (const message of messages) {
      const cached: Message = {
        body: message.body,
        timestamp: new Date(message.datetime_created).getTime(),
        isResearcher: message.sender_id === researcherId,
      }
      const key = messageKey(cached)
      const count = remaining.get(key) ?? 0
      if (count > 0) remaining.set(key, count - 1)
      else merged.push(cached)
    }
    const sortedMessages = R.sortBy(merged, m => m.timestamp)
    return {
      studyId,
      participantId,
      resolved: existingResolved ?? false,
      timestamp: sortedMessages.at(-1)?.timestamp ?? existing?.timestamp ?? 0,
      messages: sortedMessages,
    }
  }

  const refresh = async () => {
    if (isLoading.value) return
    isLoading.value = true
    try {
      const [researcherId, lastRefresh] = await Promise.all([
        getResearcherId(),
        getLastRefreshTime()
      ])

      const studyIds = getStudyIds()
      const refreshStartedAt = Date.now()
      const earliest = refreshStartedAt - MESSAGE_LOOKBACK_MS
      const previous = lastRefresh ? Date.parse(lastRefresh) : NaN
      const cursor = Number.isFinite(previous) && previous <= refreshStartedAt ? Math.max(previous, earliest) : earliest
      const createdAfter = new Date(cursor).toISOString()
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
        
        // Merge available history for this user with messages already cached.
        const allUserMessages = await fetchUserMessages(participantId)
        const studyMessages = allUserMessages.filter(m => m.data.study_id === studyId)
        
        const hasParticipantMessages = studyMessages.some(m => m.sender_id === participantId)
        const correspondence = await buildCorrespondence(
          studyId,
          participantId,
          studyMessages,
          researcherId,
          !hasParticipantMessages
        )
        
        await db.set(`${MESSAGES_PATH}/${key}`, correspondence)
      }

      // Advance only after all reads and writes succeed. Using the request start
      // avoids skipping messages that arrived while the refresh was in flight.
      await setLastRefreshTime(new Date(refreshStartedAt).toISOString())
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
    const correspondence = await buildCorrespondence(
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

  const getOrCreateCorrespondence = (studyId: string, participantId: string): Correspondence => {
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
