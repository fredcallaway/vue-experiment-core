import { declareDataView, declareDataViewJson } from '../../../composables/dataViews'

declareDataView('trial', session => [{ session_id: session.meta.sessionId, response: 'fixture' }])
declareDataViewJson('details', session => ({ session_id: session.meta.sessionId }))
declareDataViewJson('empty', () => null)
