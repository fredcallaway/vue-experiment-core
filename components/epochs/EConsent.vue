<script lang="ts" setup>
const { done } = useEpoch('consent')

const saidNo = ref(false)
const aborted = ref(false)

const abortExperiment = (reason: 'TIMEOUT' | 'ABORTED') => {
  if (aborted.value) return
  if (useConfig().completion.mode === 'prolific' && useCurrentSession().mode === 'live') {
    useUnload().disable()
    const code = useCompletionCode(reason)
    window.location.href = `https://app.prolific.co/submissions/complete?cc=${code}`
  } else {
    aborted.value = true
  }
}

const totalTimeoutSeconds = 120_000 / 1000
const { idle } = useIdle(60_000)
const timer = useTimer(60_000, { immediate: false })
timer.onDone(() => abortExperiment('TIMEOUT'))

watchEffect(() => {
  if (idle.value && timer.status.value === 'paused') {
    timer.resume()
  }
  if (!idle.value) {
    timer.reset()
  }
})

const slots = useSlots()

</script>

<template>
  <div v-if="aborted" flex-center hfull>
    <div my5 italic text-gray>the experiment has been aborted</div>
    <img src="https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=700" alt="cat" >
  </div>
  <div v-else-if="idle" class="w150 text-center p-8 mx-auto">
    <h1 class="text-2xl font-bold mb-4">Are you there?</h1>
    <div class="text-gray-600 mb-6">
      It looks like you've left the page.
      <br/>
      The experiment will automatically timeout in
      <div text-4xl mt5>{{ timer.secondsLeft }} </div>
      seconds.
    </div>
  </div>
  <div v-else-if="saidNo" class="flex items-center justify-center">
    <div class="max-w-md text-center p-8">
      <h1 class="text-2xl font-bold mb-4">Are you sure?</h1>
      <p class="text-gray-600 mb-6">
        Clicking the abort button will abort the experiment and send you back 
        to Prolific to return the submission.
      </p>
      <div flex="~ row gap-4" flex-center debug>
        <PButton value="agree" btn-primary @click="saidNo = false">
          <span i-mdi-arrow-left />
          Back to consent
        </PButton>

        <PButton value="decline" btn-red @click="abortExperiment('TIMEOUT')" >
          <span i-mdi-close />
          Abort Experiment
        </PButton>
      </div>
    </div>
  </div>
  <div v-else class="bg-white">
    <div class="max-w-4xl mx-auto px-4">
      <div class="bg-white">
        <h2>We need your consent to proceed</h2>
        <div class="text-red-500 mb-4">
          Warning: the experiment will timeout if you leave this page idle
          for more than {{ totalTimeoutSeconds }} seconds.
        </div>
    
        <div class="bg-gray-50 p-6 border-2 text-sm overflow-y-auto h-100 ">
          <div w-110 mx-auto mt20 v-if="!slots.default">
            If you're reading this, you should either put the correct
            consent form in Consent.vue or message the researcher telling them
            they're missing their consent form.
          </div>
          <slot />
        </div>

        <h4 class="text-lg font-semibold mt-2 mb-2">Do you understand and consent to these terms?</h4>

        <div flex="~ row gap-4">
          <PButton value="agree" btn-primary @click="done">
            <span i-mdi-check />
            I agree
          </PButton>
          
          <PButton value="decline" btn-red @click="saidNo = true" >
            <span i-mdi-close />
            I do not want to participate
          </PButton>
        </div>
      </div>
    </div>
  </div>
</template>