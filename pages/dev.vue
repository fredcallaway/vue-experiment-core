<script lang="ts" setup>
import { parseUrlParams, useCurrentSession } from '../composables/useCurrentSession'
import { useDebugSaving } from '../internal/composables/useDebugSaving'
import { getUrlFlag } from '../utils/url-params'



const meta = useCurrentSession()
const params = parseUrlParams()

// Browser tests retain a seeded session and in-memory events without opening a database session.
const testing = import.meta.dev && getUrlFlag('testing')
if (meta.mode === 'live') {
  console.error('refusing to initialize session in live mode on /dev')
  meta.mode = 'debug'
}
if (!testing && (params.sessionId || params.mode)) {
  useDebugSaving().start()
}



</script>

<template>
  <Experiment />
</template>
