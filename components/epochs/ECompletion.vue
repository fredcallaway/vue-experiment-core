<script lang="ts" setup>

// NOTE: this page has only been tested with config.completion.mode == 'prolific'

const props = defineProps<{
  error?: boolean
}>()

if (!props.error) {
  useEpoch('Completion') // we never call done from here
}

const config = useConfig()
const dataWriter = useDataWriter()

const online = useOnline()
const longWait = useTimeout(30_000)
const dataSaved = ref(false)

// whenever(longWait, () => useUnload().disable())

const code = computed(() => {
  if (config.completion.mode !== 'prolific') return null
  if (props.error) return getCompletionCode('ERROR')
  if (longWait.value && !dataSaved.value) return getCompletionCode('DISCONNECTED')
  return getCompletionCode('COMPLETED')
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

const initialized = computed(() => {
  return dataWriter.initialized
})

</script>

<template>
  <div w-full>
    <div mx-auto w-150 text-center select-text >

      <!-- heading -->
      <template v-if="error">
        <h1>The experiment encountered an error!</h1>
        <p>We have recorded the error and will message you if we need more information.</p>
      </template>
      <template v-else>
        <h1>Thanks!</h1>
        <p>You have completed the study. Your final bonus is ${{ useBonus().dollars.toFixed(2) }}.</p>
      </template>
      
      <!-- screen shown in dev/debug mode when data writing was never initialized -->
      <div v-if="!initialized" card-gray mt10>
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

      <!-- data saving is in progress or failed  -->
      <div v-else-if="!minWait || !dataSaved">
        <div v-if="!online">
          It looks like your internet connection is down.
          <b>Do NOT close or refresh the page!</b>
          The submit button will appear when your connection is restored.
        </div>
        <div v-else-if="!longWait">
          <div>Please wait for your data to be saved...</div>
          <div mt-3 mx-auto class="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-300" />
        </div>
        <div v-else>
          <template v-if="config.completion.mode === 'prolific'">
            <div>We're having trouble saving your data. Please submit with code: <b>{{ code }}</b></div>
            <button btn-primary mt-10 @click="handleSubmit">
              Submit to Prolific
            </button>
          </template>
          <template v-else>
            <div>We're having trouble saving your data. Please contact {{ config.contactEmail }} to make sure you are credited.</div>
            <button btn-primary mt-10 @click="handleSubmit">
              Submit Study
            </button>
          </template>
        </div>
      </div>

      <!-- data saving is complete -->
      <div v-else>
        <template v-if="config.completion.mode === 'prolific'">
          <div v-if="code">
            <p p-2>Your completion code is: <b>{{ code }}</b></p>
            <p>Click the button below to be redirected to the Prolific completion page.</p>
          </div>
          <button btn-primary mt-10 @click="handleSubmit">
            Submit to Prolific
          </button>
        </template>
        <template v-else>
          <p>Your data has been saved. Thank you for participating!</p>
          <button btn-primary mt-10 @click="handleSubmit">
            Submit Study
          </button>
        </template>
      </div>
    </div>
  </div>
</template>
