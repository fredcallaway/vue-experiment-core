<script setup lang="ts">

definePageMeta({
  layout: 'dashboard',
})

const prolific = useProlific()
const { deploy, localSha, deployedSha, status, error: deploymentError, gitStatus } = useDeployment()

const MIN_WAGE = 8
const PROLIFIC_FEE = 1.33

const config = useConfig()

// Persist deployment error to localStorage
const persistedDeploymentError = useLocalStorage('prolific-deployment-error', '')

// Load persisted error on mount
if (persistedDeploymentError.value && !deploymentError.value) {
  deploymentError.value = persistedDeploymentError.value
}

// Watch for deployment errors and persist them
watch(deploymentError, (newError) => {
  if (newError) {
    persistedDeploymentError.value = newError
  }
})

const dismissDeploymentError = () => {
  deploymentError.value = ''
  persistedDeploymentError.value = ''
}

const formData = ref<ProlificConfig>(structuredClone(getProlificConfig()))

if (!formData.value.eligibility) {
  formData.value.eligibility = {
    allowUK: true,
    minSubmissions: 50,
    maxSubmissions: 100000,
    minApprovalRate: 99,
    requireEnglishFluency: true,
    requireEnglishPrimary: true,
  }
}

const bypassGitCheck = ref(false)
const bypassDeployedCheck = ref(false)

const internalName = computed(() => {
  return `v${config.version || 'unknown'} (git ${localSha.value})`
})

const saveConfig = useAsyncRunner()
const saveConfigToFile = async () => {
  await saveConfig.run(async () => {
    await fetch('/api/prolific/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData.value)
    })
  })
}

const hourlyWage = computed(() => {
  if (!formData.value.reward || !formData.value.estimated_completion_time || formData.value.estimated_completion_time === 0) {
    return 0
  }
  return (formData.value.reward * 60) / (formData.value.estimated_completion_time * 100)
})
const isValidWage = computed(() => {
  return hourlyWage.value >= MIN_WAGE
})
const totalCost = computed(() => formData.value.total_available_places * formData.value.reward * PROLIFIC_FEE / 100)

const cannotSubmitReason = computed(() => {
  if (!isValidWage.value) return 'Wage is too low'
  if (status.value == 'loading') return 'Deploying...'
  if (status.value != 'deployed' && !bypassDeployedCheck.value && !bypassGitCheck.value) return 'Not deployed'
  return ''
})

const canSubmit = computed(() => cannotSubmitReason.value === '')


const create = useAsyncRunner()
const createStudy = async ({publish = false}: {publish?: boolean} = {}) => {
  await create.run(async () => {
    const study = await prolific.createStudy({
      ...formData.value,
      internal_name: internalName.value
    })
        
    if (publish) {
      // Validate deployment one last time before submitting
      if (!canSubmit.value) {
        throw new Error(`Problem submitting: ${cannotSubmitReason.value}`)
      }
      await prolific.publishStudy(study.id)
      await addStudy(study.id, {
        sha: deployedSha.value,
        publishTime: Date.now(),
        version: useConfig().version,
        completionCodes: Object.fromEntries(study.completion_codes.map((x) => [x.code_type, x.code])),
      })
    }
    
    // await prolific.getStudiesCache().refresh()
    await navigateTo(`/prolific/${study.id}`)
  })
}

</script>

<template>
  <div class="p-8 max-w1200px">

    <NuxtLink to="/prolific" class="absolute translate-y--5 translate-x-1"> ← All Studies </NuxtLink>

    <h2 mb2 mt4>Create New Study</h2>

    <Error :error="create.error.value || deploymentError || saveConfig.error.value" />

    <div class="grid grid-cols-2 gap-6">
      <!-- Reward/Time/Wage/Places/Cost Card -->
      <div card-gray>
        <div class="flex flex-row gap-4 mb-4">
          <div flex-1>
            <label class="block mb-2 font-semibold">Reward (cents)</label>
            <NumberInput text-base v-model="formData.reward" input w-full />
          </div>

          <div flex-1>
            <label class="block mb-2 font-semibold">Est. Time (mins)</label>
            <NumberInput text-base 
              v-model="formData.estimated_completion_time" 
              input w-full
            />
          </div>

          <div flex-1>
            <label class="block mb-2 font-semibold">Max Time (mins)</label>
            <NumberInput text-base 
              v-model="formData.maximum_allowed_time" 
              input w-full
            />
          </div>
        </div>

        <div font-bold text-xl mb-4>
          <span i-mdi-cash-clock text-2xl/>
          Hourly wage: ${{ hourlyWage.toFixed(2) }}/hr
          <span v-if="!isValidWage" class="text-error font-semibold">
            (minimum: ${{ MIN_WAGE }}/hr)
          </span>
        </div>

        <div class="mb-4">
          <label class="block mb-2 font-semibold">Total Places</label>
          <NumberInput text-base 
            v-model="formData.total_available_places" 
            input w-full
          />
        </div>

        <div font-bold text-xl>
          <span i-mdi-cash-multiple text-2xl/>
          Total cost: ${{ totalCost.toFixed(2) }}
        </div>
      </div>

      <!-- Public Name/Description Card -->
      <div card-gray space-y-4>
        <div>
          <label class="block mb-2 font-semibold">Public Name</label>
          <input
            v-model="formData.name"
            type="text"
            input w-full
          />
        </div>
        <div>
          <label class="block mb-2 font-semibold">Description (HTML)</label>
          <textarea 
            v-model="formData.description" 
            input w-full
            font-mono text-sm
            rows="5"
            resize-y
          ></textarea>
        </div>
      </div>

      <!-- Eligibility Card -->
      <div card-gray>
        <div class="grid grid-cols-2 gap-6">
          <div class="space-y-4">
            <label class="flex items-center gap-2">
              <input 
                v-model="formData.eligibility!.allowUK" 
                type="checkbox"
              />
              <span>Allow UK participants</span>
            </label>
            
            <label class="flex items-center gap-2">
              <input 
                v-model="formData.eligibility!.requireEnglishFluency" 
                type="checkbox"
              />
              <span>Require English fluency</span>
            </label>
            
            <label class="flex items-center gap-2">
              <input 
                v-model="formData.eligibility!.requireEnglishPrimary" 
                type="checkbox"
              />
              <span>Require English as primary language</span>
            </label>
          </div>

          <div class="space-y-4">
            <div>
              <label class="block mb-2 font-semibold">Min Submissions</label>
              <NumberInput text-base 
                v-model="formData.eligibility!.minSubmissions!" 
                input w-full
              />
            </div>
            
            <div>
              <label class="block mb-2 font-semibold">Max Submissions</label>
              <NumberInput text-base 
                v-model="formData.eligibility!.maxSubmissions!" 
                input w-full
              />
            </div>
            
            <div>
              <label class="block mb-2 font-semibold">Min Approval Rate (%)</label>
              <NumberInput text-base 
                v-model="formData.eligibility!.minApprovalRate!" 
                input w-full
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Status Card -->
      <div card-gray space-y-4>
        <div v-if="status === 'deployed'" card-success>
          <b>✓ Deployed and ready to publish</b>
          <br>
          <div>commit: <span class="font-mono">{{ localSha }}</span></div>
        </div>
        <div v-else-if="status === 'dirty'" card-warn>
          <span i-mdi-alert ml--2 translate-y--1 text-2xl/>
          <b>Git worktree is not clean</b>
          <br>
          <pre>{{ gitStatus }}</pre>
          <div mt3>Commit or stash your changes before deploying.</div>
          <label class="flex items-center gap-2 mt-2">
            <input 
              v-model="bypassGitCheck" 
              type="checkbox" 
            />
            Bypass git status check
          </label>
          <div v-if="bypassGitCheck && localSha != deployedSha" mt-2>
            <b>Warning: current code is not deployed</b>
            <div>current commit: <span class="font-mono">{{ localSha }}</span></div>
            <div>deployed commit: <span class="font-mono">{{ deployedSha }}</span></div>
          </div>
        </div>
        <div v-else-if="status === 'ready'" card-info>
          <b>Ready to deploy! </b>
          <div>current commit: <span class="font-mono">{{ localSha }}</span></div>
          <div>deployed commit: <span class="font-mono">{{ deployedSha }}</span></div>
          <label class="flex items-center gap-2 mt-2">
            <input 
              v-model="bypassDeployedCheck" 
              type="checkbox" 
            />
            Bypass deployment check
          </label>
        </div>
        <div v-else-if="status === 'loading'" card-info>
          <b>Deploying...</b>
          <div>current commit: <span class="font-mono">{{ localSha }}</span></div>
          <div>deployed commit: <span class="font-mono">{{ deployedSha }}</span></div>
        </div>

        <div v-else-if="status === 'error'" card-error>
          <b>⚠ Error building/deploying site</b>
          <br>
          <pre>{{ deploymentError }}</pre>
        </div>
        <div v-else-if="cannotSubmitReason" card-error>
          <b>⚠ {{ cannotSubmitReason }}</b>
        </div>

        <button
          v-if="status === 'error'"
          @click="dismissDeploymentError"
          btn-gray
        >
          Dismiss Error
        </button>
        <button
          v-else
          @click="deploy"
          btn-blue
          :disabled="R.isIncludedIn(status, ['loading', 'deployed', 'dirty'])"
        >
          {{ status == 'loading' ? 'Deploying...' : 'Deploy Website' }}
        </button>
      </div>
    </div>

    <div class="mt-6 flex gap-4">
      <button
        @click="saveConfigToFile"
        btn-gray
        :disabled="saveConfig.loading.value"
      >
        {{ saveConfig.loading.value ? 'Saving...' : 'Save Config' }}
      </button>
      <button 
        @click="createStudy({publish: false})" 
        class="btn-gray"
        :disabled="!canSubmit || create.loading.value"
      >
        {{ create.loading.value ? 'Creating...' : 'Create Draft' }}
      </button>
      <button 
        @click="createStudy({publish: true})" 
        class="btn-green"
        :disabled="!canSubmit || create.loading.value"
      >
        {{ create.loading.value ? 'Creating...' : 'Create & Publish Study' }}
      </button>
    </div>
  </div>
</template>

