<script setup lang="ts">
// import { useProlific } from '~/local/useProlific'
// import { createTextFilter } from '~/utils/textFilter'

definePageMeta({
  layout: 'dashboard',
})

const N_PRELOAD_STUDIES = 0

const prolific = useProlific()
const { token, setToken, projectId, status, studyList, deleteStudy } = prolific

const tokenInput = ref(token.value)
const projectIdInput = ref(projectId.value)

watch(token, (newToken) => {
  tokenInput.value = newToken
})

const { items: studies, timestamp: studiesTimestamp, isLoading: loading } = studyList.value
const cacheError = ref<Error | null>(null)

const searchQuery = ref('')
const filteredStudies = computed(() => {
  if (!studies.value) return []
  if (!searchQuery.value.trim()) return studies.value
  
  const filter = createTextFilter(searchQuery.value)
  return studies.value.filter(study => {
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
})

const error = computed(() => {
  if (cacheError.value) {
    const e = cacheError.value as any
    return e?.message || String(e)
  }
  return ''
})

const handleTokenUpdate = async () => {
  if (!tokenInput.value.trim()) return
  await setToken(tokenInput.value)
}

const handleProjectIdUpdate = () => {
  projectId.value = projectIdInput.value
}

const debounceTokenUpdate = useDebounceFn(handleTokenUpdate, 1000)

const deleteAllDrafts = async () => {
  if (!studies.value) return
  
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
            v-model="tokenInput" 
            type="text" 
            input-mono
            w-full
            placeholder="Enter your Prolific API token"
            @keyup.enter="handleTokenUpdate"
            @blur="handleTokenUpdate"
            @input="debounceTokenUpdate"
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
            v-model="projectIdInput" 
            type="text" 
            input-mono
            w-55
            placeholder="Enter project ID or leave blank"
            @keyup.enter="handleProjectIdUpdate"
            @blur="handleProjectIdUpdate"
          />
        </div>

        <div class="flex gap-2">
          <button 
            v-if="studies?.some(s => s.status === 'UNPUBLISHED')"
            @click="deleteAllDrafts" 
            btn-red
            :disabled="loading"
          >
            Delete All Drafts
          </button>
          <NuxtLink 
            to="/prolific/create" 
            btn-green
          >
            Create New Study
          </NuxtLink>
        </div>
      </div>
    </div>

    <!-- Error Display -->
    <div v-if="error" class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 whitespace-pre-wrap">
      {{ error }}
    </div>

    <!-- Study List View -->
    <div v-if="prolific && status == 'ok'">

      <div flex="~ row gap-2 justify-between items-end" mb-2>
        <div>
          <h2>Studies ({{ filteredStudies.length }})</h2>
          <div class="text-xs text-gray-500">
            Last updated: {{ formatDateTime(studiesTimestamp, 'never') }}
            <button
              @click="studyList.refresh()"
              :disabled="loading"
              class="ml-2 text-blue-600 hover:underline disabled:text-gray-400"
            >
              {{ loading ? 'Refreshing...' : 'Refresh' }}
            </button>
          </div>
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

