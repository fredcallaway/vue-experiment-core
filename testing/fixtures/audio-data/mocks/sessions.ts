import { computed, ref } from 'vue'
import type { SessionData } from '../../../../internal/data'

// Keep production formatting/statistics; substitute only the participant data and network operations.
export * from '../../../../internal/local-data'

const sessions: SessionData[] = [1, 2].map(index => ({
  meta: { sessionId: `audio-session-${index}`, participantId: `participant-${index}`, studyId: '',
    mode: 'live', version: 'audio-test', startTime: 1000, lastUpdateTime: 4000,
    completionTime: 4000, bonus: 0, assignment: index },
  events: index === 2 ? [{ timestamp: 2000, eventType: 'fluency.block', index: 0, uid: 'event-1',
    currentEpochId: 'trial[1]', data: { audio_path: 'word-naming/p2/audio-session-2/legacy.wav',
      audio_mime_type: 'audio/wav', audio_bytes: 8044 } }] : [],
  other: index === 1 ? { files: { clip: { saved: true, contentType: 'audio/wav', size: 8044,
    bucket: 'audio-fixture.invalid', path: 'sessions/uid/audio-session-1/clip%20one.wav' } } } : null,
}))

export const useSessionData = (_mode: string, id: string) => {
  const data = ref(sessions.find(session => session.meta.sessionId === id) ?? null)
  return { data, meta: computed(() => data.value?.meta), downloadTime: ref(5000), status: ref('completed') }
}
export const useAllData = () => ({
  sessions: ref(Object.fromEntries(sessions.map(session => [session.meta.sessionId, session.meta]))),
  syncStatus: ref('synced'), syncLocalData: async () => {}, lastUpdateTime: ref(4000), lastSyncTime: ref(5000),
})
export const readLocalSessionData = async (_mode: string, id: string) =>
  sessions.find(session => session.meta.sessionId === id)!
export const useProlificMessages = () => ({ getOrCreateCorrespondence: () => null })
