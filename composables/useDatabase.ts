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
  
  whenever(connected, () => {
    // @ts-ignore   the config file is empty before initializing a project
    console.log('Connected to database: ', firebaseConfig.databaseURL)
  }, { once: true })

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

  const sync = <T>(path: string, initialValue: T, { deep = true, debounce = 500, maxWait = 2000 } = {}) => {
    const data = ref(initialValue)
    const ready = ref(false)

    const unsubValue = onValue(dbRef(db, path), (snap) => {
      if (!snap.exists()) {
        set(dbRef(db, path), data.value)
        ready.value = true
        return
      }
      const val = snap.val()
      data.value = val
      ready.value = true
    })

    const unsubWatch = watchDebounced(data, () => {
      set(dbRef(db, path), data.value)
    }, { deep, debounce, maxWait })

    const unsubscribe = () => {
      unsubValue()
      unsubWatch()
    }
    onScopeDispose(unsubscribe)

    return extendRef(data, {
      syncImmediate: () => set(dbRef(db, path), data.value),
      unsubscribe,
      ready
     })
  }

  return {
    db,
    connected,
    disconnectedSeconds,
    assertConnected,
    sync,
    get: (path: string) => get(dbRef(db, path)),
    set: (path: string, value: any) => set(dbRef(db, path), value),
    update: (path: string, value: object) => update(dbRef(db, path), value),
    onValue: (path: string, callback: (snap: DataSnapshot) => void) => onValue(dbRef(db, path), callback)
  }
})
