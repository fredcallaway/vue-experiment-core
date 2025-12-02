<script lang="ts" setup>

defineWindowSize({ width: 400, height: 600 })

const P = useParticipant()


const sendLogs = async () => {
  logEvent('test.eventview.sending...')
  await new Promise(resolve => setTimeout(resolve, 1000))
  for (let i = 0; i < 20; i++) {
    logEvent(`test.eventview.${i}`)
  }
  logEvent('test.eventview', {data: 'is the plural of datum'})
  logDebug('test.debug', {message: 'hello'})
  logEvent('what.theheck')
  logEvent('epoch.start.test', {id: 'test[1]-foobar'})

  P.emit('test.eventview', {
    message: 'hello'
  })
}

onMounted(() => {
  sendLogs()
})

useInspect({'foo': 'bar'})

</script>

<template>
  <div flex-center h-30>
    <button btn @click="sendLogs">Send Logs</button>

  </div>
</template>