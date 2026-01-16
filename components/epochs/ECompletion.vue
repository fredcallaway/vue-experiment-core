<script lang="ts" setup>
useEpoch('Completion') // we never call done from here

const props = defineProps<{
  error?: boolean
}>()

const config = useConfig()
const dataWriter = useDataWriter()

const completedCode = config.completion.mode === 'prolific' ? useCompletionCode('COMPLETED') : null
const errorCode = config.completion.mode === 'prolific' ? useCompletionCode('ERROR') : null

const online = useOnline()
const longWait = useTimeout(30_000)
const dataSaved = ref(false)

// whenever(longWait, () => useUnload().disable())

const code = computed(() => {
  if (props.error) return useCompletionCode('ERROR')
  if (longWait.value && !dataSaved.value) return useCompletionCode('ABORTED')
  return useCompletionCode('COMPLETED')
})

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

const meta = useCurrentSession()
meta.completionTime = Date.now()
logEvent('experiment.complete', meta)

if (dataWriter.initialized) {
  dataWriter.flush().then(() => dataSaved.value = true)
}
const minWait = useTimeout(2000)

const saveDebugData = async () => {
  await dataWriter.initializeSession(useCurrentSession())
  dataWriter.flush()
}

</script>

<template>
  <div w-full>
    <div mx-auto w-150 text-center select-text >

      <template v-if="error">
        <h1>The experiment encountered an error!</h1>
        <p>We have recorded the error and will message you if we need more information.</p>
      </template>
      <template v-else>
        <h1>Thanks!</h1>
        <p>You have completed the study. Your final bonus is ${{ useBonus().dollars.toFixed(2) }}.</p>
      </template>
  
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

      <div v-else-if="!minWait || !dataSaved">
        <p>
          Please wait for your data to be saved.
        </p>
        <p v-if="!online">
          It looks like your internet connection is down. Please check your connection and try again.
        </p>
        <p v-else-if="longWait">
          We're having trouble saving your data. Please submit with code: <b>{{ code }}</b>
        </p>
        <button v-if="longWait" btn-primary mt-10 @click="handleSubmit">
          Submit to Prolific
        </button>
      </div>

      <div v-else>
        <div v-if="completedCode">
          <p p-2>Your completion code is: <b>{{ code }}</b></p> 
          <p>Click the button below to be redirected to the Prolific completion page.</p> 
        </div>
        <button btn-primary mt-10 @click="handleSubmit">
          Submit to Prolific
        </button>
      </div>
    </div>
  </div>
</template>