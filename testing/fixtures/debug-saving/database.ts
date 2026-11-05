import { ref } from 'vue'

const values: Record<string, unknown> = {}
const writes: Record<string, unknown>[] = []
const pending: (() => void)[] = []
const control = {
  values,
  writes,
  failUpdates: false,
  failConnection: false,
  hold: false,
  pending,
  release() {
    control.hold = false
    pending.splice(0).forEach(resolve => resolve())
  },
}
Object.assign(window, { __debugDatabase: control })

const database = {
  connected: ref(true),
  disconnectedSeconds: ref(0),
  async assertConnected() {
    if (control.failConnection) throw new Error('Fixture connection failed')
  },
  async get(path: string) {
    return { exists: () => Object.hasOwn(values, path), val: () => structuredClone(values[path]) }
  },
  async set(path: string, value: unknown) { values[path] = JSON.parse(JSON.stringify(value)) },
  onValue(path: string, callback: (snapshot: { val: () => unknown }) => void) {
    callback({ val: () => values[path] })
    return () => {}
  },
  async update(_path: string, batch: Record<string, unknown>) {
    writes.push(structuredClone(batch))
    if (control.hold) await new Promise<void>(resolve => pending.push(resolve))
    if (control.failUpdates) throw new Error('Fixture write rejected')
    Object.assign(values, structuredClone(batch))
  },
}

export const useDatabase = () => database
