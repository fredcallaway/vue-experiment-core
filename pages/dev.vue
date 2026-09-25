<script lang="ts" setup>
import { logError } from '../composables/logEvent'
import { parseUrlParams, useCurrentSession } from '../composables/useCurrentSession'
import { useDataWriter } from '../composables/useDataWriter'



const meta = useCurrentSession()
const params = parseUrlParams()

if (params.sessionId || params.mode) {
  if (params.mode == 'live') {
    console.error('refusing to initialize session in live mode on /dev');
    meta.mode = 'debug'
  }
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