<script lang="ts" setup>
useEpoch('Completion') // we never call done from here
const config = useConfig()
const dataWriter = useDataWriter()

const code = config.completion.mode === 'prolific' ? useCompletionCode('COMPLETED') : null

const link = computed(() => {
  switch (config.completion.mode) {
    case 'link':
      return config.completion.link
    case 'prolific':
      return `https://app.prolific.co/submissions/complete?cc=${code}`
    default:
      throw new Error(`No completion link found`)
  }
})

const online = useOnline()
const longWait = useTimeout(5000)
whenever(longWait, () => useUnload().disable())

const handleSubmit = () => {
  useUnload().disable()
  window.location.href = link.value
}

onMounted(() => {
  logEvent('experiment.complete')
  dataWriter.updateMeta({ completionTime: Date.now() })
  dataWriter.flush()
})
</script>

<template>
  <div w-full>
    <div mx-auto w-min-140 text-center>
      <h1>Thanks!</h1>
      <p>You have completed the study. Your final bonus is ${{ useBonus().dollars.toFixed(2) }}.</p>
  
      <div v-if="dataWriter.hasPendingUpdates">
        <p>
          Please wait for your data to be saved.
        </p>
        <p v-if="!online">
          It looks like your internet connection is down. Please check your connection and try again.
        </p>
        <p v-else-if="longWait">
          This is taking longer than expected. Try refreshing the page.
        </p>
      </div>
  
      <div v-else>
        <div v-if="code">
          <p p-2>Your completion code is: <b>{{ code }}</b></p> 
          <p>Click "Submit" to be redirected to the Prolific completion page.</p> 
        </div>
        <button btn-primary mt-10 @click="handleSubmit">
          Submit to Prolific
        </button>
      </div>
    </div>
  </div>
</template>