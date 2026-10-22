<script lang="ts" setup>
import { logError } from '../composables/logEvent'
import { parseUrlParams, useCurrentSession } from '../composables/useCurrentSession'
import { useDataWriter } from '../composables/useDataWriter'
import { getUrlFlag } from '../utils/url-params'



const meta = useCurrentSession()
const params = parseUrlParams()

// Browser tests retain a seeded session and in-memory events without opening a database session.
const testing = import.meta.dev && getUrlFlag('testing')
if (params.mode == 'live') {
  console.error('refusing to initialize session in live mode on /dev')
  meta.mode = 'debug'
}
if (!testing && (params.sessionId || params.mode)) {
  console.log('initializing dev session', meta)
  useDataWriter().initializeSession(meta).then((error) => {
    if (error instanceof Error) {
      logError('Failed to initialize data writer; check firebase.config.json', error)
    }
  })
}



</script>

<template>
  <Experiment />
</template>
