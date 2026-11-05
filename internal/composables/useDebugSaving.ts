import { createGlobalState } from '@vueuse/core'
import { useCurrentSession } from '../../composables/useCurrentSession'
import { useDatabase } from '../../composables/useDatabase'
import { useDataWriter } from '../../composables/useDataWriter'
import { timeoutPromise } from '../../utils/misc'

export class DebugSessionExistsError extends Error {}

export const useDebugSaving = createGlobalState(() => {
  const meta = useCurrentSession()
  const writer = useDataWriter()
  const saving = ref(false)
  const requested = ref(false)
  const requestError = shallowRef<unknown>(null)
  const pendingId = ref<string | null>(null)

  const sessionId = computed(() => pendingId.value ?? (requested.value || writer.initialized ? meta.sessionId : null))
  const error = computed(() => requestError.value ?? writer.saveError.value)
  const state = computed(() => {
    if (saving.value) return 'saving'
    if (writer.savingPaused.value) return 'off'
    if (error.value && (requested.value || writer.initialized)) return 'error'
    if (writer.saveCount.value > 0 && meta.mode === 'debug') return 'on'
    return requested.value || writer.initialized ? 'saving' : 'off'
  })

  // A later successful background write also clears a failed explicit save attempt.
  watch(writer.saveCount, () => { requestError.value = null }, { flush: 'sync' })

  const start = async (newSessionId?: string): Promise<unknown> => {
    if (saving.value) return
    if (newSessionId) pendingId.value = newSessionId
    saving.value = true
    requested.value = true
    requestError.value = null
    const minimumWait = timeoutPromise(500)
    let failure: unknown = null

    try {
      if (pendingId.value) {
        const db = useDatabase()
        await db.assertConnected()
        if ((await db.get(`debug/meta/${pendingId.value}`)).exists()) {
          throw new DebugSessionExistsError('This session ID is already in use. Choose another.')
        }
        meta.sessionId = pendingId.value
        pendingId.value = null
      }
      meta.mode = 'debug'
      writer.savingPaused.value = false
      if (!writer.ready.value) {
        const result = await writer.initializeSession(meta)
        if (result !== true) throw result || new Error('Could not connect to the debug database.')
      }
      if (!await writer.flush()) {
        throw writer.saveError.value ?? new Error('The save was not confirmed. Check your connection and retry.')
      }
    } catch (cause) {
      failure = cause
      if (cause instanceof DebugSessionExistsError) {
        pendingId.value = null
        requested.value = false
      } else {
        requestError.value = cause
      }
    } finally {
      await minimumWait
      saving.value = false
    }
    return failure
  }

  const stop = () => { writer.savingPaused.value = true }
  return { state, sessionId, error, start, stop }
})
