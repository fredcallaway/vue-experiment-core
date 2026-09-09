<script setup lang="ts">
import { PROLIFIC_FEE, type StudyFull, type StudyShort, type Submission } from '#imports'

// import { useProlific } from '~/local/useProlific'
// import { createTextFilter } from '~/utils/textFilter'

definePageMeta({
  layout: 'dashboard',
})

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
const showConnectionModal = ref(false)

const searchQuery = ref('')
const isReady = computed(() => status.value === 'ok')
const showConnectionForm = computed(() => !isReady.value || showConnectionModal.value)
const tokenIsValid = computed(() => R.isIncludedIn(status.value, ['ok', 'invalidProjectId']))
const activeStudyList = computed(() => isReady.value ? studyList.value : null)
const studies = computed(() => activeStudyList.value?.items.value ?? [])
const studiesTimestamp = computed(() => activeStudyList.value?.timestamp.value ?? null)
const loading = computed(() => activeStudyList.value?.isLoading.value ?? false)
const allData = useAllData('live')
type StudySummary = { averageBonus: number | null, totalCost: number }

const cachedStudySummaries = useLocalStorage<Partial<Record<string, StudySummary>>>('prolificStudySummaries:v1', {})
const bonusOverridesByStudy = new Map<string, Ref<Record<string, number | undefined>>>()
const studyDetailsById = new Map<string, ReturnType<typeof prolific.getStudyCache>>()
const loadedStudyIds = new Set<string>()
let preloadingStudyDetails = false

const getBonusOverrides = (studyId: string) => {
  let overrides = bonusOverridesByStudy.get(studyId)
  if (!overrides) {
    overrides = useLocalStorage<Record<string, number | undefined>>(`bonusOverrides.${studyId}`, {})
    bonusOverridesByStudy.set(studyId, overrides)
  }
  return overrides.value
}

const getStudyDetails = (studyId: string) => {
  let details = studyDetailsById.get(studyId)
  if (!details) {
    details = prolific.getStudyCache(studyId, { autoRefresh: false })
    studyDetailsById.set(studyId, details)
  }
  return details
}

const getCodeType = (study: StudyFull, submission: Submission) => {
  if (!submission.study_code) return 'NOCODE'
  if (submission.study_code === 'Manual Completion') return 'MANUAL'
  return study.completion_codes.find(code => code.code === submission.study_code)?.code_type ?? submission.study_code
}

const derivedStudySummaries = computed(() => {
  const summaries: Partial<Record<string, StudySummary>> = {}
  if (allData.isLoading.value) return summaries

  const sessions = allData.sessions.value ? Object.values(allData.sessions.value) : []

  for (const study of studies.value) {
    const fullStudy = getStudyDetails(study.id).fullItem.value
    if (!fullStudy) continue

    const studySessions = sessions.filter(session => session.studyId === study.id)
    const sessionsBySubmissionId = R.pullObject(
      studySessions,
      R.prop('sessionId'),
      R.identity(),
    )
    const databaseBonuses: Record<string, number> = {}
    for (const session of studySessions) {
      if (session.participantId === 'UNKNOWN' || session.bonus === undefined) continue
      if (databaseBonuses[session.participantId] !== undefined) {
        throw new Error(`Duplicate participant ID: ${session.participantId}`)
      }
      databaseBonuses[session.participantId] = round(session.bonus * 100)
    }
    const overrides = getBonusOverrides(study.id)
    const isComplete = (submission: Submission) => {
      const session = sessionsBySubmissionId[submission.id]
      return !!session?.completionTime && getCodeType(fullStudy, submission) === 'COMPLETED'
    }
    const intendedBonuses = R.pullObject(fullStudy.submissions, R.prop('participant_id'), submission => {
      const currentBonus = sum(submission.bonus_payments)
      const databaseBonus = isComplete(submission) || submission.status === 'APPROVED'
        ? (databaseBonuses[submission.participant_id] ?? 0)
        : 0
      return overrides[submission.participant_id] ?? Math.max(currentBonus, databaseBonus)
    })
    const eligible = fullStudy.submissions.filter(submission => (
      isComplete(submission) && overrides[submission.participant_id] === undefined
    ))
    const averageBonus = eligible.length === 0
      ? null
      : sum(eligible.map(submission => intendedBonuses[submission.participant_id] ?? 0)) / eligible.length
    const totalCost = PROLIFIC_FEE * (fullStudy.reward * fullStudy.places_taken + sum(R.values(intendedBonuses)))

    summaries[study.id] = { averageBonus, totalCost }
  }

  return summaries
})

watch(derivedStudySummaries, (summaries) => {
  for (const [studyId, summary] of Object.entries(summaries)) {
    if (summary) cachedStudySummaries.value[studyId] = summary
  }
}, { immediate: true })

const studySummaries = computed(() => ({
  ...cachedStudySummaries.value,
  ...derivedStudySummaries.value,
}))

const totalParticipants = computed(() => sum(studies.value.map(study => study.places_taken ?? 0)))
const totalCost = computed(() => {
  const summaries = studies.value.map(study => studySummaries.value[study.id])
  if (summaries.some(summary => !summary)) return null
  return sum(summaries.map(summary => summary?.totalCost ?? 0))
})
const nextStudy = computed(() => studies.value.find(study => study.status !== 'COMPLETED') ?? null)

const getAverageBonusText = (study: StudyShort) => {
  const summary = studySummaries.value[study.id]
  if (!summary) return '…'
  return summary.averageBonus === null ? 'N/A' : formatCents(summary.averageBonus)
}

const getTotalCostText = (study: StudyShort) => {
  if (study.status !== 'COMPLETED') return '???'
  const summary = studySummaries.value[study.id]
  return summary ? formatCents(summary.totalCost) : '…'
}

const filteredStudies = computed(() => {
  if (!studies.value) return []
  const base = searchQuery.value.trim()
    ? studies.value.filter(study => {
        const filter = createTextFilter(searchQuery.value)
        const searchText = [
          study.id,
          study.internal_name,
          study.name,
          prolific.displayStudyStatus(study),
          study.published_at || '',
          formatDateTime(study.published_at ?? 'N/A')
        ].join(' ')
        return filter(searchText)
      })
    : studies.value
  return R.sortBy(base, [s => s.published_at ?? '', 'desc'])
})

const preloadStudyDetails = async () => {
  if (preloadingStudyDetails) return
  preloadingStudyDetails = true
  try {
    while (true) {
      const study = studies.value.find(item => !loadedStudyIds.has(item.id))
      if (!study) return

      loadedStudyIds.add(study.id)
      try {
        const details = getStudyDetails(study.id)
        if (study.status !== 'COMPLETED' || !cachedStudySummaries.value[study.id]) {
          await details.refresh()
        }
      } catch (error) {
        console.error(`Could not load study details for ${study.id}`, error)
      }
      await timeoutPromise(1000)
    }
  } finally {
    preloadingStudyDetails = false
  }
}

watch(studies, () => {
  for (const study of studies.value) getBonusOverrides(study.id)
  void preloadStudyDetails()
}, { immediate: true })

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

const openConnectionModal = () => {
  setupError.value = ''
  showConnectionModal.value = true
}

const closeConnectionModal = () => {
  showConnectionModal.value = false
}

onKeyStroke('Escape', () => {
  if (showConnectionModal.value) closeConnectionModal()
})

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

watch([showConnectionForm, tokenIsValid], ([showForm, validToken]) => {
  if (showForm && validToken && workspaceOptions.value.length === 0 && !isLoadingWorkspaces.value) {
    loadWorkspaces()
  }
}, { immediate: true })

watch(selectedWorkspaceId, () => {
  loadProjects()
})

</script>

<template>
  <div class="p-8 max-w-7xl min-w-2xl mx-auto">

    <section class="bg-gray-100 rounded-lg p-5 mb-6">
      <div flex="~ wrap gap-6 items-stretch">
        <div flex="~ gap-8 items-center">
          <div min-w-20>
            <div text-3xl font-semibold>{{ isReady ? studies.length : '—' }}</div>
            <div text-sm text-gray-600>Studies</div>
          </div>
          <div min-w-24>
            <div text-3xl font-semibold>{{ isReady ? totalParticipants.toLocaleString() : '—' }}</div>
            <div text-sm text-gray-600>Participants</div>
          </div>
          <div min-w-28>
            <div text-3xl font-semibold>{{ !isReady ? '—' : totalCost === null ? '…' : formatCents(totalCost) }}</div>
            <div text-sm text-gray-600>Dollars spent</div>
          </div>
        </div>

        <button
          v-if="isReady && nextStudy"
          class="flex-1 min-w-64 text-left border-l border-gray-300 pl-6 pr-3 py-1 group"
          @click="navigateTo(`/prolific/${nextStudy.id}`)"
        >
          <div flex="~ justify-between gap-3 items-center" mb-1>
            <span text-xs font-semibold uppercase tracking-wide text-amber-700>
              {{ prolific.displayStudyStatus(nextStudy) }}
            </span>
            <span text-sm text-gray-500 group-hover:text-gray-900>Open study →</span>
          </div>
          <div font-semibold truncate>{{ nextStudy.internal_name }}</div>
          <div text-sm text-gray-600 mt-1>
            {{ nextStudy.places_taken ?? 0 }} / {{ nextStudy.total_available_places }} places filled
          </div>
        </button>
        <div v-else-if="isReady" flex-1 min-w-64 border-l border-gray-300 pl-6 flex="~ col justify-center">
          <div font-semibold>All studies completed</div>
          <div text-sm text-gray-600>No study currently needs attention.</div>
        </div>
        <div v-else flex-1 min-w-64 border-l border-gray-300 pl-6 flex="~ col justify-center">
          <div font-semibold>Connect Prolific</div>
          <div text-sm text-gray-600>Enter an API token and project below to load study activity.</div>
        </div>

        <div flex="~ col gap-2 justify-center items-stretch">
          <button v-if="isReady" btn-gray @click="openConnectionModal">
            Prolific Connection
          </button>
          <button btn-green :disabled="!isReady" @click="goToCreateStudy">
            Create New Study
          </button>
        </div>
      </div>
    </section>

    <div
      v-if="showConnectionForm"
      :class="showConnectionModal
        ? 'fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4'
        : 'mb-6'"
      @click.self="showConnectionModal && closeConnectionModal()"
    >
      <section
        class="bg-white border border-gray-200 rounded-lg p-6 w-full"
        :class="showConnectionModal ? 'max-w-4xl max-h-[90vh] overflow-y-auto shadow-xl' : ''"
        :role="showConnectionModal ? 'dialog' : undefined"
        :aria-modal="showConnectionModal || undefined"
        aria-labelledby="prolific-connection-title"
      >
        <div flex="~ justify-between gap-4 items-start" mb-6>
          <div>
            <h2 id="prolific-connection-title">Prolific Connection</h2>
            <p text-gray-600 mt-1>Enter a token and choose, create, or directly identify a project.</p>
          </div>
          <button
            v-if="showConnectionModal"
            class="text-gray-500 hover:text-gray-900"
            aria-label="Close Prolific connection"
            @click="closeConnectionModal"
          >
            <span i-mdi-close text-2xl />
          </button>
        </div>

        <div grid="~ cols-2 gap-8" class="max-lg:grid-cols-1">
          <div>
            <div flex="~ justify-between gap-3 items-center" mb-2>
              <label for="prolific-token" font-semibold>API token</label>
              <span v-if="status === 'unknown'" text-sm text-gray-500>Validating…</span>
              <span v-else-if="tokenIsValid" text-sm text-green-700>✓ Valid</span>
              <span v-else text-sm text-red-700>✗ Missing or invalid</span>
            </div>
            <input
              id="prolific-token"
              v-model="token"
              type="text"
              input-mono
              w-full
              placeholder="Enter your Prolific API token"
            />
            <p text-sm text-gray-600 mt-2>
              Create or copy a token from <strong>API Tokens</strong> in your Prolific account.
            </p>
          </div>

          <div>
            <div flex="~ justify-between gap-3 items-center" mb-2>
              <label for="prolific-project-id" font-semibold>Project ID</label>
              <span v-if="status === 'unknown'" text-sm text-gray-500>Validating…</span>
              <span v-else-if="status === 'ok'" text-sm text-green-700>✓ Connected</span>
              <span v-else text-sm text-red-700>✗ Missing or invalid</span>
            </div>
            <input
              id="prolific-project-id"
              v-model="projectId"
              type="text"
              input-mono
              w-full
              placeholder="Enter a Prolific project ID"
            />
            <p text-sm text-gray-600 mt-2>Paste an ID directly, or use the workspace tools below.</p>
          </div>
        </div>

        <div border-t border-gray-200 mt-6 pt-6>
          <div flex="~ justify-between gap-4 items-end" mb-4>
            <label flex-1>
              <span block font-semibold mb-2>Workspace</span>
              <select
                v-model="selectedWorkspaceId"
                input
                w-full
                :disabled="!tokenIsValid || isLoadingWorkspaces || workspaceOptions.length === 0"
              >
                <option v-if="workspaceOptions.length === 0" value="">
                  {{ tokenIsValid ? 'No workspaces found' : 'Enter a valid API token first' }}
                </option>
                <option v-for="workspace in workspaceOptions" :key="workspace.id" :value="workspace.id">
                  {{ workspace.label }}
                </option>
              </select>
            </label>
            <button btn-gray :disabled="!tokenIsValid || isLoadingWorkspaces" @click="loadWorkspaces">
              {{ isLoadingWorkspaces ? 'Loading…' : 'Reload Workspaces' }}
            </button>
          </div>

          <div grid="~ cols-2 gap-8" class="max-lg:grid-cols-1">
            <div>
              <div font-semibold mb-2>Use an existing project</div>
              <select
                v-model="selectedExistingProjectId"
                input
                w-full
                :disabled="!selectedWorkspaceId || isLoadingProjects || projectOptions.length === 0"
              >
                <option v-if="projectOptions.length === 0" value="">
                  {{ isLoadingProjects ? 'Loading projects…' : 'No projects found' }}
                </option>
                <option v-for="project in projectOptions" :key="project.id" :value="project.id">
                  {{ project.label }}
                </option>
              </select>
              <button btn-green mt-3 :disabled="!selectedExistingProjectId" @click="useExistingProject">
                Use Project
              </button>
            </div>

            <div>
              <div font-semibold mb-2>Create a new project</div>
              <input v-model="projectTitle" input w-full aria-label="Project name" />
              <button
                btn-green
                mt-3
                :disabled="!selectedWorkspaceId || isCreatingProject"
                @click="createProject"
              >
                {{ isCreatingProject ? 'Creating…' : 'Create Project' }}
              </button>
            </div>
          </div>
        </div>

        <div v-if="setupError" class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mt-5">
          {{ setupError }}
        </div>
      </section>
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
        <div flex="~ gap-2 items-center">
          <button
            v-if="studies.some(study => study.status === 'UNPUBLISHED')"
            btn-red
            :disabled="loading"
            @click="deleteAllDrafts"
          >
            Delete All Drafts
          </button>
          <TextFilter v-model="searchQuery" placeholder="e.g. active,complete 11/5" />
        </div>
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
              <th px-2 py-2 text-right whitespace-nowrap>Avg Bonus</th>
              <th px-2 py-2 text-right whitespace-nowrap>Total Cost</th>
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
              <td px-2 py-2 text-sm whitespace-nowrap>{{ prolific.displayStudyStatus(study) }}</td>
              <td px-2 py-2 whitespace-nowrap>{{ formatDateTime(study.published_at ?? 'N/A') }}</td>
              <td px-2 py-2 text-right whitespace-nowrap>${{ (study.reward / 100).toFixed(2) }}</td>
              <td px-2 py-2 text-right whitespace-nowrap>{{ getAverageBonusText(study) }}</td>
              <td px-2 py-2 text-right whitespace-nowrap>{{ getTotalCostText(study) }}</td>
              <td px-2 py-2 text-right whitespace-nowrap>{{ study.places_taken ?? 0 }} / {{ study.total_available_places }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
