<script lang="ts" setup>

definePageMeta({
  layout: 'bare',
})

const meta = useCurrentSession()
useDataWriter().initializeSession(meta)

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

</script>

<template>
  <div flex-center min-h-80vh>
    <MainContent v-show="!unloading" bg-white>
      <Experiment />
    </MainContent>
    <div v-if="unloading" shrink-0 w600px h600px mx-auto p-3 bg-white>
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
</template>