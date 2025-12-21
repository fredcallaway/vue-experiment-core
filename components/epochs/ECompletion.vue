<script lang="ts" setup>
useEpoch('Completion') // we never call done from here
const config = useConfig()
const dataWriter = useDataWriter()

const completedCode = config.completion.mode === 'prolific' ? useCompletionCode('COMPLETED') : null
const errorCode = config.completion.mode === 'prolific' ? useCompletionCode('ERROR') : null

const online = useOnline()
const longWait = useTimeout(30_000)
whenever(longWait, () => useUnload().disable())

const code = computed(() => longWait.value ? errorCode : completedCode)

const link = computed(() => {
  switch (config.completion.mode) {
    case 'link':
      return config.completion.link
    case 'prolific':
      return `https://app.prolific.co/submissions/complete?cc=${code.value}`
    default:
      throw new Error(`No completion link found`)
  }
})

const handleSubmit = () => {
  useUnload().disable()
  window.location.href = link.value
}

logEvent('experiment.complete')
dataWriter.updateMeta({ completionTime: Date.now() })
if (dataWriter.initialized) {
  dataWriter.flush()
}
const minWait = useTimeout(2000)

const saveDebugData = async () => {
  await dataWriter.initializeSession(useCurrentSession())
  dataWriter.flush()
}

</script>

<template>
  <div w-full>
    <div mx-auto w-140 text-center>
      <h1>Thanks!</h1>
      <p>You have completed the study. Your final bonus is ${{ useBonus().dollars.toFixed(2) }}.</p>
  
      <div v-if="!dataWriter.initialized" card-gray mt10>
        <p>
          The study is running in development mode. If you want to save the data to the debug database, click the button below.
        </p>
        <pre text-left text-xs bg-white p2 border-gray-400 border-2 overflow-y-auto max-h-60 class="subtle-scrollbar" >{{ 
          {
            meta: useCurrentSession(),
            events: dataWriter.events,
          }
        }}</pre>
        <button btn-blue mt4 @click="saveDebugData">
          Save data to debug database
        </button>
      </div>

      <div v-else-if="!minWait || dataWriter.hasPendingUpdates">
        <p>
          Please wait for your data to be saved.
        </p>
        <p v-if="!online">
          It looks like your internet connection is down. Please check your connection and try again.
        </p>
        <p v-else-if="longWait">
          We're having trouble saving your data. Please submit with code: <b>{{ errorCode }}</b>
        </p>
        <button v-if="longWait" btn-primary mt-10 @click="handleSubmit">
          Submit to Prolific
        </button>
      </div>

      <div v-else>
        <div v-if="completedCode">
          <p p-2>Your completion code is: <b>{{ completedCode }}</b></p> 
          <p>Click "Submit" to be redirected to the Prolific completion page.</p> 
        </div>
        <button btn-primary mt-10 @click="handleSubmit">
          Submit to Prolific
        </button>
      </div>
    </div>
  </div>
</template>