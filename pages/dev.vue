<script lang="ts" setup>


const meta = useCurrentSession()
const params = parseUrlParams()

if (params.sessionId || params.mode) {
  if (params.mode == 'live') {
    console.error('refusing to initialize session in live mode on /dev');
    meta.mode = 'debug'
  }
  console.log('initializing dev session', meta)
  useDataWriter().initializeSession(meta)
}

</script>

<template>
  <Experiment />
</template>