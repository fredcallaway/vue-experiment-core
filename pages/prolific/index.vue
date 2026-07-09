<script setup lang="ts">
// import { useProlific } from '~/local/useProlific'
// import { createTextFilter } from '~/utils/textFilter'

definePageMeta({
  layout: 'dashboard',
})

const N_PRELOAD_STUDIES = 0

const prolific = useProlific()
const { token, projectId, status, studyList, deleteStudy } = prolific

const { items: studies, timestamp: studiesTimestamp, isLoading: loading } = studyList.value
const cacheError = ref<Error | null>(null)
const setupError = ref('')
const workspaceOptions = ref<{ id: string, label: string }[]>([])
const selectedWorkspaceId = ref('')
const projectTitle = ref('Experiment project')
const projectDescription = ref('Studies for this experiment')
const isLoadingWorkspaces = ref(false)
const isCreatingProject = ref(false)

const searchQuery = ref('')
const isReady = computed(() => status.value === 'ok')
const showSetupInstructions = computed(() => status.value !== 'unknown' && status.value !== 'ok')
const filteredStudies = computed(() => {
  if (!studies.value) return []
  const base = searchQuery.value.trim()
    ? studies.value.filter(study => {
        const filter = createTextFilter(searchQuery.value)
        const searchText = [
          study.id,
          study.internal_name,
          study.name,
          study.status,
          study.published_at || '',
          formatDateTime(study.published_at ?? 'N/A')
        ].join(' ')
        return filter(searchText)
      })
    : studies.value
  return R.sortBy(base, [s => s.published_at ?? '', 'desc'])
})

const error = computed(() => {
  if (cacheError.value) {
    const e = cacheError.value as any
    return e?.message || String(e)
  }
  return ''
})

const deleteAllDrafts = async () => {
  if (!isReady.value || !studies.value) return
  
  const drafts = studies.value.filter(s => s.status === 'UNPUBLISHED')
  if (drafts.length === 0) {
    alert('No drafts to delete')
    return
  }
  
  if (!confirm(`Delete ${drafts.length} draft${drafts.length === 1 ? '' : 's'}?`)) return
  
  for (const draft of drafts) {
    await deleteStudy(draft.id)
  }
}

const loadWorkspaces = async () => {
  setupError.value = ''
  isLoadingWorkspaces.value = true
  try {
    const workspaces = await prolific.listWorkspaces()
    workspaceOptions.value = workspaces.map(workspace => ({
      id: workspace.id,
      label: workspace.title || workspace.name || workspace.id,
    }))
    selectedWorkspaceId.value = workspaceOptions.value[0]?.id ?? ''
    if (workspaceOptions.value.length === 0) {
      setupError.value = 'No Prolific workspaces were found for this API token.'
    }
  } catch (error) {
    setupError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isLoadingWorkspaces.value = false
  }
}

const createProject = async () => {
  if (!selectedWorkspaceId.value) return

  setupError.value = ''
  isCreatingProject.value = true
  try {
    const project = await prolific.createProject(selectedWorkspaceId.value, {
      title: projectTitle.value.trim() || 'Experiment project',
      description: projectDescription.value.trim() || undefined,
    })
    projectId.value = project.id
  } catch (error) {
    setupError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isCreatingProject.value = false
  }
}

const goToCreateStudy = () => {
  if (!isReady.value) return
  navigateTo('/prolific/create')
}

onMounted(() => {
  // refresh the studies page asynchronously if it's not very recent
  if (status.value !== 'ok') return
  console.log('refresh cache?', studiesTimestamp.value, Date.now())
  if (studiesTimestamp.value && studiesTimestamp.value < Date.now() - 10000) {
    studyList.value.refresh()
  }
})

whenever(() => status.value === 'ok' && studies.value.length > 0, async () => {
  // preload the first few studies
  for (const study of studies.value.slice(0, N_PRELOAD_STUDIES)) {
    prolific.getStudyCache(study.id)
    await timeoutPromise(1000) // rate limit
  }
})

</script>

<template>
  <div class="p-8 max-w-7xl min-w-2xl mx-auto">

    <!-- Token & Project Form -->
    <div class="bg-gray-100 p-4 rounded mb-6">
      <div class="flex gap-4 items-end">
        <div flex-1>
          <div flex="~ row gap-2">
            <label class="block mb-2 font-semibold text-sm">Prolific API Token</label>
            <span v-if="status == 'unknown'" class="text-sm text-gray-600">
              Validating...
            </span>
            <span v-else-if="R.isIncludedIn(status, ['ok', 'invalidProjectId'])" class="text-sm text-green-600">
              ✓ Valid
            </span>
            <span v-else-if="status == 'invalidToken'" class="text-sm text-red-600">
              ✗ Invalid
            </span>
          </div>
          <input 
            v-model="token" 
            type="text" 
            input-mono
            w-full
            placeholder="Enter your Prolific API token"
          />
        </div>

        <div>
          <div flex="~ row gap-2">
            <label class="block mb-2 font-semibold text-sm">Project ID</label>
            <span v-if="status == 'unknown'" class="text-sm text-gray-600">
              Validating...
            </span>
            <span v-else-if="status == 'ok'" class="text-sm text-green-600">
              ✓ Valid
            </span>
            <span v-else-if="status == 'invalidProjectId'" class="text-sm text-red-600">
              ✗ Invalid
            </span>
          </div>
          <input 
            v-model="projectId" 
            type="text" 
            input-mono
            w-55
            placeholder="Enter project ID"
          />
        </div>

        <div class="flex gap-2">
          <button 
            v-if="studies?.some(s => s.status === 'UNPUBLISHED')"
            @click="deleteAllDrafts" 
            btn-red
            :disabled="!isReady || loading"
          >
            Delete All Drafts
          </button>
          <button
            btn-green
            :disabled="!isReady"
            @click="goToCreateStudy"
          >
            Create New Study
          </button>
        </div>
      </div>
    </div>

    <div v-if="showSetupInstructions" class="bg-yellow-50 border border-yellow-300 px-4 py-3 rounded mb-4">
      <h2 mb-2>Connect Prolific</h2>

      <div grid="~ cols-2 gap-6" class="max-lg:grid-cols-1">
        <div>
          <h3 mb-1>API token</h3>
          <p mb-2>
            Create an API token from your Prolific account settings, then paste it above. Prolific documents API tokens
            in its
            <a href="https://docs.prolific.com/api-reference/introduction" target="_blank" rel="noopener">
              API reference
            </a>.
          </p>
          <p v-if="status === 'invalidToken'" text-red-700>
            The current token is missing or invalid.
          </p>
        </div>

        <div>
          <h3 mb-1>Project ID</h3>
          <p mb-2>
            The project ID is required. If you already have a Prolific project, open it in Prolific and copy the
            project ID from the URL, then paste it above.
          </p>
          <p v-if="status === 'invalidProjectId'" text-red-700 mb-3>
            The current project ID is missing or invalid.
          </p>

          <div class="bg-white border border-yellow-200 rounded p-3">
            <div font-semibold mb-2>Create a Prolific project from here</div>
            <div flex="~ gap-2 items-end wrap" mb-3>
              <button
                btn-gray
                :disabled="token.length < 10 || isLoadingWorkspaces"
                @click="loadWorkspaces"
              >
                {{ isLoadingWorkspaces ? 'Loading...' : 'Load Workspaces' }}
              </button>
              <select
                v-if="workspaceOptions.length > 0"
                v-model="selectedWorkspaceId"
                input
              >
                <option v-for="workspace in workspaceOptions" :key="workspace.id" :value="workspace.id">
                  {{ workspace.label }}
                </option>
              </select>
            </div>

            <div grid="~ cols-2 gap-3" class="max-lg:grid-cols-1">
              <label>
                <span block mb-1 font-semibold text-sm>Project name</span>
                <input v-model="projectTitle" input w-full />
              </label>
              <label>
                <span block mb-1 font-semibold text-sm>Description</span>
                <input v-model="projectDescription" input w-full />
              </label>
            </div>

            <button
              btn-green
              mt-3
              :disabled="!selectedWorkspaceId || isCreatingProject"
              @click="createProject"
            >
              {{ isCreatingProject ? 'Creating...' : 'Create Project' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="setupError"
      class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 whitespace-pre-wrap"
    >
      {{ setupError }}
    </div>

    <!-- Error Display -->
    <div v-if="error" class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 whitespace-pre-wrap">
      {{ error }}
    </div>

    <ProlificMessages v-if="isReady" mb3 rounded mb-4 />

    <!-- Study List View -->
    <div v-if="prolific && isReady">

      <div flex="~ row gap-2 justify-between items-end" mb-2>
        <div>
          <h2>Studies ({{ filteredStudies.length }})</h2>
          <RefreshButton
            :refresh="studyList.refresh"
            :is-loading="loading"
            :timestamp="studiesTimestamp"
            label="Last updated:"
          />
        </div>
        <TextFilter v-model="searchQuery" placeholder="e.g. active,complete 11/5" />
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-gray-200">
              <th px-2 py-2 text-left whitespace-nowrap>Study ID</th>
              <th px-2 py-2 text-left whitespace-nowrap>Internal Name</th>
              <th px-2 py-2 text-left whitespace-nowrap>Status</th>
              <th px-2 py-2 text-left whitespace-nowrap>Published At</th>
              <th px-2 py-2 text-right whitespace-nowrap>Reward</th>
              <th px-2 py-2 text-right whitespace-nowrap>Places</th>
            </tr>
          </thead>
          <tbody>
            <tr 
              v-for="study in filteredStudies" 
              :key="study.id"
              @click="navigateTo(`/prolific/${study.id}`)"
              class="cursor-pointer hover:bg-gray-100"
            >
              <td px-2 py-2 font-mono text-xs whitespace-nowrap>{{ study.id }}</td>
              <td px-2 py-2 whitespace-nowrap>{{ study.internal_name }}</td>
              <td px-2 py-2 text-sm whitespace-nowrap>{{ study.status }}</td>
              <td px-2 py-2 whitespace-nowrap>{{ formatDateTime(study.published_at ?? 'N/A') }}</td>
              <td px-2 py-2 text-right whitespace-nowrap>${{ (study.reward / 100).toFixed(2) }}</td>
              <td px-2 py-2 text-right whitespace-nowrap>{{ study.places_taken ?? 0 }} / {{ study.total_available_places }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
