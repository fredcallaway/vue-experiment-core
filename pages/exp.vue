<script lang="ts" setup>

definePageMeta({
  layout: 'bare',
})

const meta = useCurrentSession()
const initialized = useDataWriter().initializeSession(meta)

useErrorLogging()
useBrowserMonitoring()
useDataWriter().updateOther('browser', getBrowserInfo())

const contactEmail = useConfig().contactEmail
const { unloading, cancelUnload } = useUnload()
useUnload().disable()

const { violated, width, height } = useWindowEnforcer()

watchImmediate(violated, (isViolated) => {
  if (isViolated) {
    logEvent('experiment.window.violated', { width, height })
  } else {
    logEvent('experiment.window.ok', { width, height })
  }
})

const { isPrimary } = useMultipleTabDetection()

watchImmediate(isPrimary, (primary) => {
  if (!primary) {
    logEvent('experiment.multipleTab.detected')
  }
})

useSizeScale().enabled.value = false

const initStatus = ref<'loading' | 'error' | 'repeat' | 'invalid-participant' | 'confirmed'>('loading')

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
  if (import.meta.dev) {
    console.log('dev mode, skipping validation')
    initStatus.value = 'confirmed'
    return
  }
  const isDebug = meta.sessionId.startsWith('debug') && meta.mode == 'debug'
  if (result !== true && !isDebug) {
    if (result instanceof Error) {
      if (result.message.includes('repeatSession.mismatch')) {
        initStatus.value = 'invalid-participant'
      } else if (result.message.includes('repeatSession.alreadyStarted')) {
        initStatus.value = 'repeat'
      } else {
        initStatus.value = 'error'
      }
    } else {
      initStatus.value = 'error'
    }
  } else if (!validateSession()) {
    initStatus.value = 'invalid-participant'
  } else {
    await minWait
    initStatus.value = 'confirmed'
    useUnload().enable()
    logEvent('experiment.connection.confirmed')
  }
})

const { status: phStatus, checkStatus: checkPhStatus } = usePosthog()

const checked = ref(false)
const handleCheckAgain = () => {
  logEvent('posthog.checkAgain')
  checkPhStatus(2)
  checked.value = true
}
const failedCheck = computed(() => {
  return checked.value && phStatus.value === 'blocked'
})

const initLoading = computed(() => {
  return (initStatus.value === 'loading') || (!checked.value && phStatus.value === 'loading')
})
</script>

<template>

  <div fixed inset-0 bg-gray-600 relative>
    <div flex-center h-100vh >
      <MainContent capture-errors bg-white border-4 fixed-width fixed-height>
        <Experiment />
      </MainContent>
    </div>

    <div v-if="initLoading" fixed inset-0 bg-white flex-center z-100>
      <div>
        loading...
        <div mt-3 mx-auto class="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-300" />
      </div>
    </div>

    <div v-else-if="phStatus == 'blocked' || checked" fixed inset-0 bg-white flex-center z-100>
      <div shrink-0 w600px mx-auto p-3 text-left h-130>
        <h1>AdBlock Detected</h1>
        <p>
          We use an analytics tool called PostHog to collect data about how you do our experiment.
          Analytics tools are sometimes used to track users without their permission,
          and so many ad blockers very reasonably disable them.
        </p>
        <p>
          We use this tool only for scientific and "debugging" purposes.
          For example, we are curious how you move your mouse during the study, and we
          need to know if an image doesn't load properly.
        </p>
        <p>
          The experiment will not work correctly without this tool, so we need you
          to disable your ad blocker while on this site. If you are not comfortable
          doing that, please return the study.
        </p>
        <div flex="~ row gap-4 justify-center" mt-4>
          <PButton value="phCheck" @click="handleCheckAgain">I disabled it</PButton>
        </div>
        <div v-if="phStatus == 'loading'" class="mt-4">
          <div mt-3 mx-auto class="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-300" />
        </div>
        <p v-if="failedCheck" class="mt-4">
          Hmm...it looks like your ad blocker is still enabled. Please try again.
          Usually, you can disable it by clicking an icon in your browser's toolbar.
          It might help to open the link in an "incognito" tab.
          If you continue to have trouble, please return the study.
        </p>
      </div>
    </div>

    <div v-else-if="initStatus === 'loading'" fixed inset-0 bg-white flex-center z-100>
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

    <div v-else-if="initStatus === 'repeat'" fixed inset-0 bg-white flex-center z-100>
      <div shrink-0 w600px mx-auto p-3 text-center>
        <h1>Repeat Session Detected</h1>
        <p>
          It looks like you've already begun this study, so you can't start again.
        </p>
        <p>
          Please return the study. If you believe you should receive partial payment, please send
          us a message through Prolific explaining what happened.
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

    <div v-if="!isPrimary" fixed inset-0 bg-white flex-center z-100>
      <div shrink-0 w600px mx-auto p-3 text-center>
        <h1>Multiple Tabs Detected</h1>
        <p>
          You have opened this experiment in multiple tabs or windows.
          Please close this tab and continue in your original tab.
        </p>
      </div>
    </div>
  </div>
</template>