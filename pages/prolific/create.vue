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

    <h2 class="mb2 mt4">Create New Study</h2>

    <Error :error="create.error.value || deploymentError" />

    <fieldset :disabled="formDataLoading" class="grid grid-cols-2 gap-6 border-0 m-0 p-0">
      <!-- Reward/Time/Wage/Places/Cost Card -->
      <div class="p-4 rounded-lg bg-gray-200 text-gray-600 [&>h3]:text-gray-700">
        <div class="flex flex-row gap-4 mb-4">
          <div class="flex-1">
            <label class="block mb-2 font-semibold">Reward (cents)</label>
            <NumberInput
              class="text-base border border-2 px-3 py-1 box-border bg-white w-35"
              :scroll-step="25"
              v-model="formData.reward"
            />
          </div>

          <div class="flex-1">
            <label class="block mb-2 font-semibold">Est. Time (mins)</label>
            <NumberInput
              class="text-base border border-2 px-3 py-1 box-border bg-white w-35"
              v-model="formData.estimated_completion_time"
            />
          </div>

          <div class="flex-1">
            <label class="block mb-2 font-semibold">Max Time (mins)</label>
            <NumberInput
              class="text-base border border-2 px-3 py-1 box-border bg-white w-35"
              v-model="formData.maximum_allowed_time"
            />
          </div>
        </div>

        <div class="font-bold text-xl mb-4">
          <span class="i-mdi-cash-clock text-2xl" />
          Hourly wage: ${{ hourlyWage.toFixed(2) }}/hr
          <span v-if="!isValidWage" class="text-error font-semibold">
            (minimum: ${{ MIN_WAGE }}/hr)
          </span>
        </div>

        <div class="mb-4">
          <label class="block mb-2 font-semibold">Total Places</label>
          <NumberInput
            class="text-base border border-2 px-3 py-1 box-border bg-white w-full"
            v-model="formData.total_available_places"
          />
        </div>

        <div class="font-bold text-xl">
          <span class="i-mdi-cash-multiple text-2xl" />
          Total cost: ${{ totalCost.toFixed(2) }}
        </div>
      </div>

      <!-- Public Name/Description Card -->
      <div class="p-4 rounded-lg bg-gray-200 text-gray-600 [&>h3]:text-gray-700 space-y-4">
        <div>
          <label class="block mb-2 font-semibold">Public Name</label>
          <input class="border border-2 px-3 py-1 box-border bg-white w-full" v-model="formData.name" type="text" />
        </div>
        <div>
          <label class="block mb-2 font-semibold">Description (HTML)</label>
          <textarea
            class="border border-2 px-3 py-1 box-border bg-white w-full font-mono text-sm resize-y"
            v-model="formData.description"
            rows="5"
          ></textarea>
        </div>
      </div>

      <!-- Eligibility Card -->
      <div class="p-4 rounded-lg bg-gray-200 text-gray-600 [&>h3]:text-gray-700">
        <div class="grid grid-cols-[1fr_auto] gap-6 items-start">
          <div class="space-y-4">
            <label class="flex items-center gap-2">
              <input v-model="formData.eligibility!.allowUK" type="checkbox" />
              <span>Allow UK participants</span>
            </label>
            
            <label class="flex items-center gap-2">
              <input v-model="formData.eligibility!.requireEnglishFluency" type="checkbox" />
              <span>Require English fluency</span>
            </label>
            
            <label class="flex items-center gap-2">
              <input v-model="formData.eligibility!.requireEnglishPrimary" type="checkbox" />
              <span>Require English as primary language</span>
            </label>

            <label class="flex items-center gap-2">
              <input v-model="formData.exclusions!.databaseParticipants" type="checkbox" />
              <span>Exclude participants in database</span>
            </label>

            <label class="flex items-center gap-2">
              <input v-model="formData.exclusions!.previousStudies" type="checkbox" />
              <span>Exclude participants from previous Prolific studies</span>
            </label>
          </div>

          <div class="space-y-4 w-45">
            <div>
              <label class="block mb-2 font-semibold">Min Submissions</label>
              <NumberInput
                class="text-base border border-2 px-3 py-1 box-border bg-white w-full"
                v-model="formData.eligibility!.minSubmissions!"
              />
            </div>
            
            <div>
              <label class="block mb-2 font-semibold">Max Submissions</label>
              <NumberInput
                class="text-base border border-2 px-3 py-1 box-border bg-white w-full"
                v-model="formData.eligibility!.maxSubmissions!"
              />
            </div>
            
            <div>
              <label class="block mb-2 font-semibold">Min Approval Rate (%)</label>
              <NumberInput
                class="text-base border border-2 px-3 py-1 box-border bg-white w-full"
                v-model="formData.eligibility!.minApprovalRate!"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Status Card -->
      <div class="p-4 rounded-lg bg-gray-200 text-gray-600 [&>h3]:text-gray-700 space-y-4">
        <div
          class="p-4 rounded-lg bg-success-200 text-success-600 [&>h3]:text-success-700"
          v-if="status === 'deployed'"
        >
          <b>✓ Deployed and ready to publish</b>
          <br>
          <div>commit: <span class="font-mono">{{ localSha }}</span></div>
        </div>
        <div
          class="p-4 rounded-lg bg-error-200 text-error-600 [&>h3]:text-error-700"
          v-else-if="status === 'unconfigured'"
        >
          <b>⚠ epoch.config.ts has not been configured</b>
          <br>
          Update the contact email (at least) in epoch.config.ts
        </div>
        <div class="p-4 rounded-lg bg-warn-200 text-warn-600 [&>h3]:text-warn-700" v-else-if="status === 'dirty'">
          <span class="i-mdi-alert ml--2 translate-y--1 text-2xl" />
          <b>Git worktree is not clean</b>
          <br>
          <pre>{{ gitStatus }}</pre>
          <div class="mt3">Commit or stash your changes before deploying.</div>
          <label class="flex items-center gap-2 mt-2">
            <input v-model="bypassGitCheck" type="checkbox" />
            Bypass git status check
          </label>
          <div class="mt-2" v-if="bypassGitCheck && localSha != deployedSha">
            <b>Warning: current code is not deployed</b>
            <div>current commit: <span class="font-mono">{{ localSha }}</span></div>
            <div>deployed commit: <span class="font-mono">{{ deployedSha }}</span></div>
          </div>
        </div>
        <div class="p-4 rounded-lg bg-info-200 text-info-600 [&>h3]:text-info-700" v-else-if="status === 'ready'">
          <b>Ready to deploy! </b>
          <div>current commit: <span class="font-mono">{{ localSha }}</span></div>
          <div>deployed commit: <span class="font-mono">{{ deployedSha }}</span></div>
          <label class="flex items-center gap-2 mt-2">
            <input v-model="bypassDeployedCheck" type="checkbox" />
            Bypass deployment check
          </label>
        </div>
        <div class="p-4 rounded-lg bg-info-200 text-info-600 [&>h3]:text-info-700" v-else-if="status === 'loading'">
          <b>Deploying...</b>
          <div>current commit: <span class="font-mono">{{ localSha }}</span></div>
          <div>deployed commit: <span class="font-mono">{{ deployedSha }}</span></div>
        </div>

        <div class="p-4 rounded-lg bg-error-200 text-error-600 [&>h3]:text-error-700" v-else-if="status === 'error'">
          <b>⚠ Error building/deploying site</b>
          <br>
          <pre>{{ deploymentError }}</pre>
        </div>
        <div class="p-4 rounded-lg bg-error-200 text-error-600 [&>h3]:text-error-700" v-else-if="cannotSubmitReason">
          <b>⚠ {{ cannotSubmitReason }}</b>
        </div>

        <div class="mt-2">
          <a :href="previewUrl" target="_blank" class="text-blue-600 hover:underline">
            Preview deployment →
          </a>
        </div>

        <button class="btn-gray" v-if="status === 'error'" @click="dismissDeploymentError">
          Dismiss Error
        </button>

        <ActionButton
          class="btn-blue"
          v-else
          loading
          :name="status == 'loading' ? 'Deploying...' : 'Deploy Website'"
          :action="onDeploy"
          :disabled="status !== 'ready'"
        />
      </div>
    </fieldset>

    <div class="mt-6 flex gap-4">
      <ActionButton
        class="btn-gray"
        loading
        :name="create.loading.value ? 'Creating...' : 'Create Draft'"
        :action="() => createStudy({publish: false})"
        :disabled="!canSubmit || create.loading.value"
      />
      <ActionButton
        class="btn-green"
        loading
        :name="create.loading.value ? 'Creating...' : 'Create & Publish Study'"
        :action="() => createStudy({publish: true})"
        success
        :disabled="!canSubmit || create.loading.value"
      />
    </div>
  </div>
</template>
