<script setup lang="ts">
// import { useProlific } from '~/local/useProlific'
// import { createTextFilter } from '~/utils/textFilter'

definePageMeta({
  layout: 'dashboard',
})

const N_PRELOAD_STUDIES = 0

const prolific = useProlific()
const { token, projectId, status, studyList, deleteStudy } = prolific

const cacheError = ref<Error | null>(null)
const setupError = ref('')
const workspaceOptions = ref<{ id: string, label: string }[]>([])
const projectOptions = ref<{ id: string, label: string }[]>([])
const selectedWorkspaceId = ref('')
const selectedExistingProjectId = ref('')
const projectTitle = ref('Experiment project')
const isLoadingWorkspaces = ref(false)
const isLoadingProjects = ref(false)
const isCreatingProject = ref(false)

const searchQuery = ref('')
const isReady = computed(() => status.value === 'ok')
const setupPanel = computed<'token' | 'project' | null>(() => {
  if (status.value === 'invalidToken') return 'token'
  if (status.value === 'invalidProjectId') return 'project'
  return null
})
const activeStudyList = computed(() => isReady.value ? studyList.value : null)
const studies = computed(() => activeStudyList.value?.items.value ?? [])
const studiesTimestamp = computed(() => activeStudyList.value?.timestamp.value ?? null)
const loading = computed(() => activeStudyList.value?.isLoading.value ?? false)
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

const loadProjects = async () => {
  if (!selectedWorkspaceId.value) {
    projectOptions.value = []
    selectedExistingProjectId.value = ''
    return
  }

  setupError.value = ''
  isLoadingProjects.value = true
  try {
    const projects = await prolific.listProjects(selectedWorkspaceId.value)
    projectOptions.value = projects.map(project => ({
      id: project.id,
      label: project.title || project.id,
    }))
    selectedExistingProjectId.value = projectOptions.value[0]?.id ?? ''
  } catch (error) {
    setupError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isLoadingProjects.value = false
  }
}

const useExistingProject = () => {
  if (!selectedExistingProjectId.value) return
  projectId.value = selectedExistingProjectId.value
}

const createProject = async () => {
  if (!selectedWorkspaceId.value) return

  setupError.value = ''
  isCreatingProject.value = true
  try {
    const project = await prolific.createProject(selectedWorkspaceId.value, {
      title: projectTitle.value.trim() || 'Experiment project',
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

const refreshStudies = async () => {
  if (!activeStudyList.value) return
  await activeStudyList.value.refresh()
}

onMounted(() => {
  // refresh the studies page asynchronously if it's not very recent
  if (status.value !== 'ok') return
  console.log('refresh cache?', studiesTimestamp.value, Date.now())
  if (studiesTimestamp.value && studiesTimestamp.value < Date.now() - 10000) {
    refreshStudies()
  }
})

watch(() => setupPanel.value, (panel) => {
  if (panel === 'project' && workspaceOptions.value.length === 0 && !isLoadingWorkspaces.value) {
    loadWorkspaces()
  }
}, { immediate: true })

watch(selectedWorkspaceId, () => {
  loadProjects()
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

    <div v-if="setupPanel === 'token'" class="bg-gray-100 p-4 rounded mb-4">
      <h2 mb-2>Connect Prolific</h2>
      <p text-red-700 mb-3>
        The current Prolific API token is missing or invalid.
      </p>
      <ol pl-5 list-decimal>
        <li>Log in to your Prolific account.</li>
        <li>Click "API Tokens" in the left sidebar.</li>
        <li>Click "Create API Token" on the top right.</li>
        <li>Copy the new token and paste it in the box below.</li>
      </ol>
      <input
        v-model="token"
        type="text"
        input-mono
        w-full
        mt-3
        placeholder="Enter your Prolific API token"
      />
    </div>

    <div v-else-if="setupPanel === 'project'" class="bg-gray-100 p-4 rounded mb-4">
      <h2 mb-2>Choose Prolific Project</h2>
      <p text-red-700 mb-3>
        The current project ID is missing or invalid.
      </p>
      <p mb-3>
        Select an existing project or create a new one.
      </p>

      <div v-if="isLoadingWorkspaces" text-gray-700>
        Loading workspaces...
      </div>
      <div v-else-if="workspaceOptions.length === 0" text-red-700>
        No Prolific workspaces were found for this API token.
      </div>
      <div v-else>
        <label block mb-3 m3>
          <span block mb-1 font-semibold >Workspace</span>
          <select v-model="selectedWorkspaceId" input w-full>
            <option v-for="workspace in workspaceOptions" :key="workspace.id" :value="workspace.id">
              {{ workspace.label }}
            </option>
          </select>
        </label>

        <div grid="~ cols-2 gap-3">
          <div p-3>
            <div font-semibold mb-2>Use an existing project</div>
            <div v-if="isLoadingProjects" text-gray-700>
              Loading projects...
            </div>
            <div v-else-if="projectOptions.length === 0" text-gray-700>
              This workspace has no projects yet.
            </div>
            <template v-else>
              <select v-model="selectedExistingProjectId" input w-full>
                <option v-for="project in projectOptions" :key="project.id" :value="project.id">
                  {{ project.label }}
                </option>
              </select>
            </template>

            <button
              btn-green
              mt-3
              :disabled="!selectedExistingProjectId"
              @click="useExistingProject"
            >
              Use Project
            </button>
          </div>

          <div p-3>
            <div font-semibold mb-2>Create a new project</div>
            <input v-model="projectTitle" input w-full aria-label="Project name" />

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
            :refresh="refreshStudies"
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
