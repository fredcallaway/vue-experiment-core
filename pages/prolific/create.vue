<script setup lang="ts">
import { useAsyncRunner } from '../../internal/composables/useAsyncRunner'
import { useDeployment } from '../../internal/composables/useDeployment'
import { useProlific } from '../../internal/composables/useProlific'
import { useProlificConfig } from '../../internal/composables/useProlificConfig'
import { useStudies } from '../../internal/composables/useStudies'
import { ProlificError, getProlificBaseUrl } from '../../internal/prolific'
import * as R from 'remeda'
import { useLocalStorage } from '@vueuse/core'

import { PROLIFIC_FEE } from '../../internal/prolific'

definePageMeta({
  layout: 'dashboard',
})

const prolific = useProlific()
const { deploy, localSha, deployedSha, deployedVersion, deployedId, version, versionError: datasetError,
  status, error: deploymentError, gitStatus, versionSafety, refreshDeployment } = useDeployment()
const { warnings: versionWarnings, loading: versionLoading, error: versionError } = versionSafety

const MIN_WAGE = 8

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
const bypassVersionCheck = ref(false)
watch(() => JSON.stringify([version.value, localSha.value, versionWarnings.value]), () => {
  bypassVersionCheck.value = false
}, { flush: 'sync' })

const internalName = computed(() => {
  return `${deployedVersion.value || 'unknown'} (git ${deployedSha.value})`
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
  if (status.value === 'unconfigured') return 'Set a real contact email in epoch.config.ts'
  if (datasetError.value) return datasetError.value
  if (!deployedVersion.value || version.value !== deployedVersion.value) return 'Deploy the selected dataset version first'
  if (versionLoading.value) return 'Checking posted experiment versions...'
  if (versionError.value) return versionError.value
  if (versionWarnings.value.length && !bypassVersionCheck.value) return 'Review the experiment version warning'
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
    await refreshDeployment()
    await versionSafety.refresh()
    if (!canSubmit.value) throw new Error(cannotSubmitReason.value)
    const deployment = { version: deployedVersion.value, sha: deployedSha.value,
      ...(deployedId.value ? { deploymentId: deployedId.value } : {}) }
    const study = await prolific.createStudy({
      ...formData.value,
      internal_name: internalName.value
    }, deployment.version)
    await useStudies().addStudy(study.id, {
      ...deployment,
      completionCodes: Object.fromEntries(study.completion_codes.map((x) => [x.code_type, x.code])),
      prolificConfig: R.clone(formData.value),
    })
        
    if (publish) {
      // Validate deployment one last time before submitting
      if (!canSubmit.value) {
        throw new Error(`Problem submitting: ${cannotSubmitReason.value}`)
      }
      const publication = await useStudies().preparePublication(study.id)
      if (publication.warnings.length && !bypassVersionCheck.value) throw new Error('Review the experiment version warning')
      await prolific.publishStudy(study.id)
      await useStudies().publishStudy(study.id, publication.deployment)
    }
    
    // await prolific.getStudiesCache().refresh()
    await navigateTo(`/prolific/${study.id}`)
  })
}

const onDeploy = async () => {
  const success = await deploy(bypassVersionCheck.value)
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
      <TutorialTarget
        class="p-4 rounded-lg bg-gray-200 text-gray-600 [&>h3]:text-gray-700"
        title="Compensation"
        help="Sets reward, completion time, places, wage, and expected study cost before creating a Prolific study."
      >
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
      </TutorialTarget>

      <!-- Public Name/Description Card -->
      <TutorialTarget
        class="p-4 rounded-lg bg-gray-200 text-gray-600 [&>h3]:text-gray-700 space-y-4"
        title="Public listing"
        help="Controls the participant-facing study name and HTML description shown on Prolific."
      >
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
        <div class="space-y-2">
          <h3 class="text-base font-semibold m-0">Audio requirements</h3>
          <label class="flex items-center gap-2">
            <input v-model="formData.peripheral_requirements" type="checkbox" value="microphone" />
            <span>Microphone (audio recording)</span>
          </label>
          <label class="flex items-center gap-2">
            <input v-model="formData.peripheral_requirements" type="checkbox" value="audio" />
            <span>Audio playback (speakers or headphones)</span>
          </label>
          <p class="text-sm m-0">Prolific shows these requirements before participants join. Describe recording in the listing too.</p>
        </div>
      </TutorialTarget>

      <!-- Eligibility Card -->
      <TutorialTarget
        class="p-4 rounded-lg bg-gray-200 text-gray-600 [&>h3]:text-gray-700"
        title="Eligibility"
        help="Configures participant eligibility filters and exclusion rules for the new study."
      >
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
      </TutorialTarget>

      <!-- Status Card -->
      <TutorialTarget
        class="p-4 rounded-lg bg-gray-200 text-gray-600 [&>h3]:text-gray-700 space-y-4"
        title="Deployment status"
        help="Checks whether the experiment is configured, committed, and deployed before study publication."
      >
        <div>
          <label for="dataset-version" class="block mb-2 font-semibold">Dataset version</label>
          <input id="dataset-version" v-model="version" type="text" :disabled="status === 'loading'"
            class="border border-2 px-3 py-1 box-border bg-white w-full" placeholder="e.g. pilot-1" />
          <p class="text-sm mt-2 mb-0">Names the live dataset. Deploy after changing it; recruitment batches can share a version.</p>
          <div v-if="datasetError" class="text-error text-sm mt-2">{{ datasetError }}</div>
          <div v-if="deployedVersion" class="text-sm mt-2">Deployed dataset: <b>{{ deployedVersion }}</b></div>
        </div>
        <VersionWarning v-model="bypassVersionCheck" :warnings="versionWarnings" />
        <div v-if="versionError" role="alert" class="text-error">{{ versionError }}</div>
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
          :disabled="status !== 'ready' || !!datasetError || versionLoading || !!versionError ||
            (versionWarnings.length > 0 && !bypassVersionCheck)"
        />
      </TutorialTarget>
    </fieldset>

    <TutorialTarget
      class="mt-6 flex gap-4"
      title="Create study"
      help="Creates a Prolific draft, or creates and publishes immediately when all checks pass."
    >
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
    </TutorialTarget>
  </div>
</template>
