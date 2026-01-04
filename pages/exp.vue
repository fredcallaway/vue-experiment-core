<script lang="ts" setup>

definePageMeta({
  layout: 'bare',
})

const meta = useCurrentSession()
const initialized = useDataWriter().initializeSession(meta)

useErrorLogging()
useBrowserMonitoring()

const contactEmail = useConfig().contactEmail
const { unloading, cancelUnload } = useUnload()
useUnload().disable()

const { violated } = useWindowEnforcer()

watchImmediate(violated, (isViolated) => {
  if (isViolated) {
    logEvent('experiment.window.violated')
  } else {
    logEvent('experiment.window.ok')
  }
})

useSizeScale().enabled.value = false

const initStatus = ref<'loading' | 'error' | 'invalid-participant' | 'ready' | 'confirmed'>('loading')

// e.g. 636d6ce3fb3683ff33f9e514
const isProlificIdentifier = (str: string) => /^[a-f\d]{24}$/i.test(str)
const validateSession = () => {
  if (meta.sessionId.startsWith('debug') && meta.mode == 'debug') return true
  if (meta.mode === 'debug') return false
  const fields = [
    meta.sessionId,
    meta.participantId,
    meta.studyId,
  ]
  return fields.every(isProlificIdentifier)
}

const minWait = timeoutPromise(2000)

initialized.then(async (result) => {
  if (result !== true) {
    initStatus.value = 'error'
  } else if (!validateSession()) {
    initStatus.value = 'invalid-participant'
  } else {
    await minWait
    initStatus.value = 'ready'
  }
})

const confirmConnection = () => {
  initStatus.value = 'confirmed'
  useUnload().enable()
  logEvent('experiment.connection.confirmed')
}

</script>

<template>
  <div flex-center min-h-80vh>
    <MainContent bg-white>
      <Experiment />
    </MainContent>

    <div v-if="initStatus === 'loading'" fixed inset-0 bg-white flex-center z-100>
      <div shrink-0 w600px mx-auto p-3 text-center>
        <h1>Connecting...</h1>
        <p>
          Please wait while we establish a connection to the server.
        </p>
      </div>
    </div>
    
    <div v-else-if="initStatus === 'error'" fixed inset-0 bg-white flex-center z-100>
      <div shrink-0 w600px mx-auto p-3 text-center>
        <h1>Connection Error</h1>
        <p>
          We were unable to establish a connection to the server.
          Please refresh the page to try again.
        </p>
        <p>
          If the problem persists, please contact {{ contactEmail }}.
        </p>
      </div>
    </div>

    <div v-else-if="initStatus === 'invalid-participant'" fixed inset-0 bg-white flex-center z-100>
      <div shrink-0 w600px mx-auto p-3 text-center>
        <h1>Invalid Link</h1>
        <p>
          We could not identify you as a valid participant.
          Please re-open the link provided by Prolific.
        </p>
        <p>
          If the problem persists, please contact {{ contactEmail }}.
        </p>
      </div>
    </div>
    
    <div v-else-if="initStatus === 'ready'" fixed inset-0 bg-white flex-center z-100>
      <div shrink-0 w-130 mx-auto p-3>
        <div card-yellow>
          <h3>Warning!</h3>
          Do not refresh the page or close the browser window during the experiment.
          If you do, you will not be able to complete the study!
        </div>
        <div flex-center mt-10>
          <PButton value="I will not refresh the page" @click="confirmConnection" />
        </div>
      </div>
    </div>

    <div v-if="unloading" fixed inset-0 bg-white flex-center z-100>
      <div shrink-0 w600px mx-auto p-3 text-center>
        <h1>Thanks for sticking around!</h1>
        <p>
          We detected that you started to close/refresh the window but canceled.
          If you're having trouble with the experiment, please leave the window
          open and contact {{ contactEmail }}.
          Otherwise, click the button below to resume the experiment.
        </p>
        <div flex-center>
          <button btn-primary mx-auto @click="cancelUnload">
            Resume Experiment
          </button>
        </div>
      </div>
    </div>
  </div>
</template>