<script setup lang="ts">
import { PROLIFIC_FEE } from '#imports'

definePageMeta({
  layout: 'dashboard',
})

const prolific = useProlific()
const { deploy, localSha, deployedSha, status, error: deploymentError, gitStatus } = useDeployment()

const MIN_WAGE = 8

const config = useConfig()
const { config: formData, isLoading: formDataLoading } = useProlificConfig()

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

const bypassGitCheck = ref(false)
const bypassDeployedCheck = ref(false)

const internalName = computed(() => {
  return `${config.version || 'unknown'} (git ${localSha.value})`
})

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
  if (formDataLoading.value) return 'Loading study draft...'
  if (!isValidWage.value) return 'Wage is too low'
  if (status.value == 'loading') return 'Deploying...'
  if (status.value != 'deployed' && !bypassDeployedCheck.value && !bypassGitCheck.value) return 'Not deployed'
  return ''
})

const canSubmit = computed(() => cannotSubmitReason.value === '')


const previewUrl = computed(() => {
  const baseUrl = getProlificBaseUrl(formData.value)
  return `${baseUrl}/exp?PROLIFIC_PID=debug&STUDY_ID=debug&SESSION_ID=debug&assignment=0`
})

const create = useAsyncRunner(err => err instanceof ProlificError ? err.userMessage : null)
const createStudy = async ({publish = false}: {publish?: boolean} = {}) => {
  await create.run(async () => {
    const study = await prolific.createStudy({
      ...formData.value,
      internal_name: internalName.value
    })
    await useStudies().addStudy(study.id, {
      sha: deployedSha.value,
      version: useConfig().version,
      completionCodes: Object.fromEntries(study.completion_codes.map((x) => [x.code_type, x.code])),
      prolificConfig: R.clone(formData.value),
    })
        
    if (publish) {
      // Validate deployment one last time before submitting
      if (!canSubmit.value) {
        throw new Error(`Problem submitting: ${cannotSubmitReason.value}`)
      }
      await prolific.publishStudy(study.id)
      await useStudies().publishStudy(study.id)
    }
    
    // await prolific.getStudiesCache().refresh()
    await navigateTo(`/prolific/${study.id}`)
  })
}

const onDeploy = async () => {
  const success = await deploy()
  if (!success) {
    throw new Error(deploymentError.value)
  }
  
}

</script>

<template>
  <div class="p-8 max-w1200px">

    <NuxtLink to="/prolific" class="absolute translate-y--5 translate-x-1"> ← All Studies </NuxtLink>

    <h2 mb2 mt4>Create New Study</h2>

    <Error :error="create.error.value || deploymentError" />

    <fieldset :disabled="formDataLoading" class="grid grid-cols-2 gap-6 border-0 m-0 p-0">
      <!-- Reward/Time/Wage/Places/Cost Card -->
      <div card-gray>
        <div class="flex flex-row gap-4 mb-4">
          <div flex-1>
            <label class="block mb-2 font-semibold">Reward (cents)</label>
            <NumberInput :scroll-step="25" text-base v-model="formData.reward" input w-35 />
          </div>

          <div flex-1>
            <label class="block mb-2 font-semibold">Est. Time (mins)</label>
            <NumberInput text-base 
              v-model="formData.estimated_completion_time" 
              input w-35
            />
          </div>

          <div flex-1>
            <label class="block mb-2 font-semibold">Max Time (mins)</label>
            <NumberInput text-base 
              v-model="formData.maximum_allowed_time" 
              input w-35
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
        <div class="grid grid-cols-[1fr_auto] gap-6 items-start">
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

            <label class="flex items-center gap-2">
              <input
                v-model="formData.exclusions!.databaseParticipants"
                type="checkbox"
              />
              <span>Exclude participants in database</span>
            </label>

            <label class="flex items-center gap-2">
              <input
                v-model="formData.exclusions!.previousStudies"
                type="checkbox"
              />
              <span>Exclude participants from previous Prolific studies</span>
            </label>
          </div>

          <div class="space-y-4 w-45">
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
        <div v-else-if="status === 'unconfigured'" card-error>
          <b>⚠ epoch.config.ts has not been configured</b>
          <br>
          Update the contact email (at least) in epoch.config.ts
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

        <div mt-2>
          <a :href="previewUrl" target="_blank" class="text-blue-600 hover:underline">
            Preview deployment →
          </a>
        </div>

        <button
          v-if="status === 'error'"
          @click="dismissDeploymentError"
          btn-gray
        >
          Dismiss Error
        </button>

        <ActionButton
          v-else
          loading
          :name="status == 'loading' ? 'Deploying...' : 'Deploy Website'"
          :action="onDeploy"
          btn-blue
          :disabled="status !== 'ready'"
        />
      </div>
    </fieldset>

    <div class="mt-6 flex gap-4">
      <ActionButton
        loading
        :name="create.loading.value ? 'Creating...' : 'Create Draft'"
        :action="() => createStudy({publish: false})"
        btn-gray
        :disabled="!canSubmit || create.loading.value"
      />
      <ActionButton
        loading
        :name="create.loading.value ? 'Creating...' : 'Create & Publish Study'"
        :action="() => createStudy({publish: true})"
        btn-green
        success
        :disabled="!canSubmit || create.loading.value"
      />
    </div>
  </div>
</template>
