<script lang="ts" setup>

const props = defineProps<{ 
  name?: string
  allowCompletion?: boolean
}>()

const { done } = useEpoch(props.name ?? 'EConnectionCheck')

const db = useDatabase()
const config = useConfig()
const contactEmail = config.contactEmail

const completionCode = props.allowCompletion && config.completion.mode === 'prolific' 
  ? getCompletionCode('DISCONNECTED') 
  : null

const link = computed(() => {
  if (!completionCode) return null
  return `https://app.prolific.com/submissions/complete?cc=${completionCode}`
})

const handleSubmit = () => {
  if (!link.value) return
  useUnload().disable()
  window.location.href = link.value
}

const online = useOnline()

whenever(db.connected, () => {
  console.log('ConnectionCheck.success')
  logEvent('ConnectionCheck.success')
  done()
}, { once: true, immediate: true })

onMounted(async () => {
  if (!db.connected.value) {
    logEvent('ConnectionCheck.failed', { online, disconnectedSeconds: db.disconnectedSeconds })
  }
})

const minWait = useTimeout(1000)
const showError = computed(() => {
  return minWait.value && !db.connected.value
})

</script>

<template>
  <div v-if="showError" text-center>
    <h1>Connection Error</h1>
    <div>
      We are unable to establish a connection to the server.
      <p v-if="!online">
        It looks like your internet connection is down. Please confirm that you can visit other web pages.
      </p>
      <p mt10>
        <b text-lg>Do not refresh this page!</b>
        <br>
        The experiment will continue automatically when the connection is restored.
      </p>
    </div>
    <p mt10>
      If the problem persists, please contact {{ contactEmail }}.
    </p>
    <div v-if="allowCompletion && completionCode" mt-10>
      <p>
        If you cannot resolve the connection issue, you can submit with code: <b>{{ completionCode }}</b>. 
        Note that you may not receive full payment if you haven't completed the study.
      </p>
      <button btn-primary mt-4 @click="handleSubmit">
        Submit to Prolific
      </button>
    </div>
  </div>
</template>

