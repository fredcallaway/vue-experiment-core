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

const { violated } = useWindowEnforcer()

watchImmediate(violated, (isViolated) => {
  if (isViolated) {
    logEvent('experiment.window.violated')
  } else {
    logEvent('experiment.window.ok')
  }
})

useSizeScale().enabled.value = false

const db = useDatabase()

const initStatus = ref<'loading' | 'error' | 'invalid-participant' | 'ready' | 'confirmed'>('loading')

initialized.then((result) => {
  if (result === true) {
    if (meta.sessionId.startsWith('debug')) {
      initStatus.value = 'ready'
    } else if (meta.participantId === 'UNKNOWN' || meta.sessionId.startsWith('UNKNOWN')) {
      initStatus.value = 'invalid-participant'
    } else {
      initStatus.value = 'ready'
    }
  } else {
    initStatus.value = 'error'
  }
})

const confirmConnection = () => {
  initStatus.value = 'confirmed'
  logEvent('experiment.connection.confirmed')
}

const showDisconnectedScreen = computed(() => {
  return initStatus.value === 'confirmed' && db.disconnectedSeconds.value > 3
})

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
      <div shrink-0 w600px mx-auto p-3 text-center>
        <h1>Connection Established</h1>
        <p>
          Participant ID: <span font-mono>{{ meta.participantId }}</span>
        </p>
        <div flex-center>
          <button btn-primary mx-auto @click="confirmConnection">
            Continue
          </button>
        </div>
      </div>
    </div>

    <div v-if="showDisconnectedScreen" fixed inset-0 bg-white flex-center z-100>
      <div shrink-0 w600px mx-auto p-3 text-center>
        <h1>Connection Lost</h1>
        <p>
          We've lost connection to the server. Please wait while we attempt to reconnect.
        </p>
        <p>
          Disconnected for: {{ db.disconnectedSeconds }} seconds
        </p>
        <p>
          If the problem persists, please contact {{ contactEmail }}.
        </p>
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