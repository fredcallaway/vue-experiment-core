import { useCurrentEpoch } from '../composables/useEpoch'
import { useCurrentSession } from '../composables/useCurrentSession'
import { useDataWriter } from '../composables/useDataWriter'
import { getUrlFlag } from '../utils/url-params'

export default defineNuxtPlugin(() => {
  if (!import.meta.dev || !getUrlFlag('testing')) return

  // Deliberately read-only: tests advance through participant input, never epoch.done().
  Object.defineProperty(window, '__experimentTest', {
    configurable: true,
    value: {
      snapshot: () => ({
        epoch: useCurrentEpoch().value.id,
        sessionId: useCurrentSession().sessionId,
        writerInitialized: useDataWriter().initialized,
        events: JSON.parse(JSON.stringify(useDataWriter().events)),
      }),
    },
  })
})
