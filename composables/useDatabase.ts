import { initializeApp } from 'firebase/app'
import { getDatabase, ref as dbRef, get, set, update, onValue, DataSnapshot } from 'firebase/database'
import firebaseConfig from '~/firebase.config.json'

export const useDatabase = createGlobalState(() => {

  const app = initializeApp(firebaseConfig)
  const db = getDatabase(app)
  const online = useOnline()

  const connected = ref(false)
  onValue(dbRef(db, '.info/connected'), (snap) => {
    connected.value = snap.val() === true
  })

  const disconnectedSeconds = ref(0)
  const { pause, resume } = useIntervalFn(() => {
    disconnectedSeconds.value++
  }, 1000)
  watch(connected, (newVal) => {
    if (newVal) {
      disconnectedSeconds.value = 0
      pause()
    } else {
      resume()
    }
  })

  const assertConnected = async ({timeout = 5000} = {}) => {
    try {
      await until(connected).toBe(true, { timeout, throwOnTimeout: true })
    } catch (error) {
      if (!online.value) {
        throw new Error('Could not establish connection to database. No internet connection.')
      }
      console.error('assertConnected error:', error)
      throw new Error('Could not establish connection to database. Check firebase.config.json')
    }
  }

  return {
    db,
    connected,
    disconnectedSeconds,
    assertConnected,
    get: (path: string) => get(dbRef(db, path)),
    set: (path: string, value: any) => set(dbRef(db, path), value),
    update: (path: string, value: any) => update(dbRef(db, path), value),
    onValue: (path: string, callback: (snap: DataSnapshot) => void) => onValue(dbRef(db, path), callback)
  }
})
