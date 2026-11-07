import { audioFile, declareDataView, declareDataViewJson } from '../../../composables/dataViews'
import type { SessionData } from '../../../internal/data'
import { sessionAudio } from '../../../internal/session-audio'

const recording = (session: SessionData) => {
  const file = sessionAudio(session, 'audio-fixture.invalid')[0]
  return file ? audioFile(file) : null
}
declareDataView('trial', session => [{ session_id: session.meta.sessionId, response: 'fixture', audio: recording(session) }])
declareDataViewJson('details', session => ({ session_id: session.meta.sessionId, audio: recording(session) }))
declareDataViewJson('empty', () => null)
