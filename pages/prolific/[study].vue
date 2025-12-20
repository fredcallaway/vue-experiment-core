<script setup lang="ts">


definePageMeta({
  layout: 'dashboard',
})
const PROLIFIC_FEE = 1.33
const route = useRoute()
const studyId = route.params.study as string
const prolific = useProlific()
const { loading, error, wrap} = useAsyncRunner()

// Reactive cache
const studyCache = prolific.getStudyCache(studyId)
const { fullItem: study, error: studyError } = studyCache

const submissions = computed(() => study.value?.submissions ?? [])

// ===== actions ============================================================

const deleteStudy = async () => {
  console.log('deleting study', studyId)
  await prolific.deleteStudy(studyId)
  await navigateTo('/prolific')
}


const pauseStudy = wrap(async () => {
  await prolific.pauseStudy(studyId)
})

const startStudy = wrap(async () => {
  await prolific.startStudy(studyId)
})

const stopStudy = wrap(async () => {
  if (!confirm('Stop study? This cannot be undone.')) return
  await prolific.stopStudy(studyId)
})

const publishStudy = wrap(async () => {
  await prolific.publishStudy(studyId)
})

const { copy } = useClipboard()

const newPlaces = ref(0)
const addPlaces = wrap(async () => {
  if (newPlaces.value <= 0) return
  if (confirm(`Add ${newPlaces.value} places?`)) {
    await prolific.addPlaces(studyId, newPlaces.value)
    newPlaces.value = 0
  }
})

// ===== bonuses ============================================================

const assignBonuses = wrap(async () => {
  const { totalAmount, confirmPayment } = await prolific.assignBonuses(studyId, intendedBonuses.value)
  if (totalAmount === 0) {
    alert('No bonuses to assign')
    return
  }

  if (confirm(`Pay ${formatCents(totalAmount)} in bonuses?`)) {
    if (totalAmount > 500_00) {
      const ok = confirm(`Double checking: ${formatCents(totalAmount)}. Are you sure you want to pay this amount?`)
      if (!ok) return
    }
    try {
      await confirmPayment()
      alert('Bonuses paid!')
    } catch (error) {
      alert('Bonuses may or may not have been paid. Please check the study on Prolific.')
    }
  }
})

const bonusCsv = ref('')

const applyCsvAdjustments = () => {
  if (!bonusCsv.value.trim()) return

  const lines = bonusCsv.value.trim().split('\n')
  for (const line of lines) {
    const [id, adjustment] = line.split(',')
    const sub = submissions.value.find(sub => sub.id === id || sub.participant_id === id)
    if (!sub) {
      alert(`Problem with line ${line}: submission not found`)
      return
    }
    const participantId = sub.participant_id
    if (id && adjustment) {
      const val = parseFloat(adjustment.trim())
      if (abs(val % 1) > 1e-6) {
        alert(`Problem with line ${line}: adjustment is not a whole number (cents)`)
        return
      }
      bonusAdjustments.value[participantId] = val
    }
  }
  bonusCsv.value = ''
}


const allData = useAllData('live')

const sessions = computed(() => {
  if (!allData.sessions.value) return null
  return Object.values(allData.sessions.value).filter(session => session.studyId === studyId)
})

const sessionsBySessionId = computed(() => {
  if (!sessions.value) return {}
  return R.pullObject(sessions.value, R.prop('sessionId'), R.identity())
})

const getDataStatus = (sub: Submission) => {
  const session = sessionsBySessionId.value[sub.id]
  if (!session) return { text: 'missing', color: 'text-gray-400' }
  if (session.completionTime) return { text: 'full', color: 'text-green-600' }
  return { text: 'partial', color: 'text-amber-500' }
}

const getCodeType = (studyCode: string | null | undefined) => {
  if (!studyCode) return 'NOCODE'
  if (!study.value) return studyCode
  return study.value.completion_codes.find(cc => cc.code === studyCode)?.code_type || studyCode
}


// ===== actions column ======================================================

type SubmissionAction = 'none' | 'approve' | 'return' | 'reject' | null

const selectedActions = ref<Record<string, SubmissionAction>>({})
const userModifiedActions = ref<Set<string>>(new Set())

const getPossibleActions = (sub: Submission) => {
  switch (sub.status) {
    case 'AWAITING REVIEW': return ['approve', 'return', 'reject', 'none']
    case 'RETURNED': return ['approve', 'none']
    default: return ['none']
  }
}

const isActionLocked = (sub: Submission) => getPossibleActions(sub).length === 1

const getActionColorClass = (action: SubmissionAction) => {
  switch (action) {
    case null: return 'text-blue-600 border-blue-600'
    case 'none': return 'text-gray-300 border-gray-300'
    case 'approve': return 'text-green-600 border-green-600'
    case 'return': return 'text-orange-500 border-orange-500'
    case 'reject': return 'text-red-600 border-red-600'
  }
}

const getDefaultAction = (sub: Submission): SubmissionAction => {
  const codeType = getCodeType(sub.study_code)
  const dataStatus = getDataStatus(sub).text
  if (codeType === 'COMPLETED' && dataStatus === 'full') return 'approve'
  if (sub.status === 'RETURNED') return 'none'
  return null
}

watch([submissions, sessions], () => {
  for (const sub of submissions.value) {
    if (!userModifiedActions.value.has(sub.id)) {
      selectedActions.value[sub.id] = getDefaultAction(sub)
    }
  }
})

const onActionChange = (submissionId: string) => {
  userModifiedActions.value.add(submissionId)
}

const executeActions = wrap(async () => {
  const actionCounts = { approve: 0, return: 0, reject: 0 }
  for (const sub of submissions.value) {
    const action = selectedActions.value[sub.id]
    if (action && action !== 'none') actionCounts[action]++
  }

  const summary = Object.entries(actionCounts)
    .filter(([_, count]) => count > 0)
    .map(([action, count]) => `${action}: ${count}`)
    .join(', ')

  if (!summary) {
    alert('No actions to execute')
    return
  }

  if (!confirm(`Execute actions? ${summary}`)) return

  for (const sub of submissions.value) {
    const action = selectedActions.value[sub.id]
    if (action === 'approve') await prolific.approveSubmission(studyId, sub.id)
    else if (action === 'return') await prolific.requestReturn(studyId, sub.id)
    else if (action === 'reject') await prolific.rejectSubmission(studyId, sub.id)
  }
})

const databaseBonuses = computed(() => {
  if (!sessions.value) return {}
  const result: Record<string, number> = {}
  for (const session of sessions.value) {
    if (session.participantId !== 'UNKNOWN' && session.bonus !== undefined) {
      if (R.isDefined(result[session.participantId])) {
        throw new Error(`Duplicate participant ID: ${session.participantId}`)
      }
      result[session.participantId] = round(session.bonus * 100)
    }
  }
  return result
})

const bonusAdjustments = ref<Record<string, number>>({})

const intendedBonuses = computed(() => {
  return R.pullObject(submissions.value, R.prop("participant_id"), sub => (
    (databaseBonuses.value[sub.participant_id] ?? 0) + 
    (bonusAdjustments.value[sub.participant_id] ?? 0)
  ))
})

const currentBonuses = computed(() => {
  return R.pullObject(submissions.value, R.prop("participant_id"), sub => sum(sub.bonus_payments))
})

const minAdjustments = computed(() => {
  return R.pullObject(submissions.value, R.prop("participant_id"), sub => (
    (currentBonuses.value[sub.participant_id] ?? 0) - 
    (databaseBonuses.value[sub.participant_id] ?? 0)
  ))
})

watchEffect(() => {
  if (submissions.value.length === 0) return

  for (const sub of submissions.value) {
    const minAdjustment = minAdjustments.value[sub.participant_id] ?? 0
    bonusAdjustments.value[sub.participant_id] = Math.max(minAdjustment, 0)
  }
})


// ===== template helpers ===================================================

const getCodeColorClass = (studyCode: string | null | undefined) => {
  if (!studyCode || !study.value) return 'text-gray-400'
  const codeType = study.value.completion_codes.find(cc => cc.code === studyCode)?.code_type
  if (!codeType) return 'text-purple'

  switch (codeType) {
    case 'COMPLETED': return 'text-green-600'
    case 'ERROR': return 'text-red-600'
    case 'ABORTED': return 'text-orange-500'
    case 'TIMEOUT': return 'text-yellow-500'
    default: return 'text-purple'
  }
}

const getSubmissionStatusColorClass = (status: SubmissionStatus) => {
  switch (status) {
    case 'ACTIVE': return 'bg-primary'
    case 'AWAITING REVIEW': return 'bg-amber'
    case 'APPROVED': return 'bg-green-600'
    case 'REJECTED': return 'bg-red-600'
    case 'RETURNED': return 'bg-gray-300'
    case 'TIMED-OUT': return 'bg-gray-500'
    case 'SCREENED OUT': return 'bg-gray-500'
    case 'PARTIALLY APPROVED': return 'bg-green-300'
    default: return 'text-purple'
  }
}

const getSubmissionStatusLabel = (status: SubmissionStatus) => {
  return status.split(' ')[0]
}

const getBonusStatus = (sub: Submission) => {
  const current = currentBonuses.value[sub.participant_id] ?? 0
  const intended = intendedBonuses.value[sub.participant_id] ?? 0
  if (intended === 0 && current === 0) return {text: 'NONE', color: 'text-gray-300'}
  if (intended > current) return {text: current, color: 'text-red-600'}
  return {text: 'PAID', color: 'text-green-600'}
}


const getStudyLink = (study: StudyShort) => {
  let link = prolific.getStudyLink(study.id)
  if (study.status === 'UNPUBLISHED') {
    link = link.replace('/submissions', '')
  }
  return link
}

// Computed properties
const costString = computed(() => {
  if (study.value === null) return '???'
  const sv = study.value
  // const base = sv.total_cost / PROLIFIC_FEE
  const base = sv.reward * sv.places_taken

  const bonus = R.pipe(sv.submissions, R.map(sub => sum(sub.bonus_payments)), R.sum())
  const total = (base + bonus)
  return `${PROLIFIC_FEE} × (${formatCents(base)} + ${formatCents(bonus)}) = ${formatCents(total)}`
})

const searchQuery = ref('')
const filteredSubmissions = computed(() => {
  if (submissions.value.length === 0) return []
  if (!searchQuery.value.trim()) return submissions.value

  const filter = createTextFilter(searchQuery.value)
  return submissions.value.filter(sub => {
    const searchText = [
      sub.participant_id,
      sub.id,
      sub.status.replace('REVIEW', ''),
      sub.study_code || '',
      getCodeType(sub.study_code)
    ].join(' ')
    return filter(searchText)
  })
})

</script>

<template>
  <div class="p-8 max-w-7xl mx-auto">
    <!-- <h1 class="text-3xl font-bold mb-6">Prolific Management</h1> -->

    <NuxtLink to="/prolific" class="absolute translate-y--5 translate-x-1"> ← All Studies </NuxtLink>
    <Error :error="error || studyError" />

    <div v-if="study">
      <div class="flex gap-6 mb-6">
        <div class="bg-gray-100 p-6 rounded flex-1">
          <h2 >{{ study.internal_name }}</h2>
          <CacheRefreshButton :cache="studyCache" mb-2 italic/>


          <div class="grid grid-cols-1 gap-2">
            <div><b>Name:</b> {{ study.name }}</div>
            <div><b>Status:</b> {{ study.status }}</div>
            <div><b>Study ID:</b> {{ study.id }}</div>
            <div><b>Reward:</b> ${{ (study.reward / 100).toFixed(2) }}</div>
            <div><b>Places:</b> {{ study.places_taken ?? 0 }} / {{ study.total_available_places }}</div>


            <div><b>Estimated Time:</b> {{ study.estimated_completion_time }} min</div>
            <div><b>Cost:</b> {{ costString }}</div>
            <a 
              :href="getStudyLink(study)"
              target="_blank"
            >
              View on Prolific →
            </a>
          </div>
        </div>

        <!-- Actions -->
        <div class="bg-gray-100 p-6 rounded min-w-100 ">
          <h2 mb4>Actions</h2>

          <!-- Draft Study Actions -->
          <div v-if="study.status === 'UNPUBLISHED'" class="flex gap-2">
            <!-- TODO (maybe) allow publishing drafts (need to pull logic from create.vue) -->
              <button 
                @click="publishStudy" 
                class="btn btn-green"
                :disabled="loading"
              >
                Publish Study
              </button>

              <button 
                @click="deleteStudy" 
                btn-red
                :disabled="loading"
              >
                Delete Study
              </button>
          </div>

          <!-- Published Study Actions -->
          <div v-else>
            <div flex gap-2 mb-4>
              <!-- set status -->
              <button 
                v-if="study.status === 'ACTIVE'" 
                btn-blue
                @click="pauseStudy" 
                :disabled="loading"
              >
                Pause Study
              </button>
              <button 
                v-if="study.status === 'PAUSED'" 
                @click="startStudy" 
                btn-green
                :disabled="loading"
              >
                Start Study
              </button>
              <button 
                v-if="study.status !== 'COMPLETED'"
                @click="stopStudy" 
                btn-red
                :disabled="loading"
              >
                Stop Study
              </button>

              <!-- add places -->
              <button 
                @click="addPlaces" 
                btn-blue
                :disabled="loading || newPlaces <= 0"
              >
                Add Places
              </button>
              <NumberInput 
                v-model="newPlaces" 
                :scroll-step="1"
                :min="0"
                text-lg
                py-1
                input
                w-20
                step="10"
              />
            </div>

            <div>
              <label class="block mb-2 font-semibold">Bulk adjust bonuses (CSV: participant_id,adjustment)</label>
              <textarea 
                v-model="bonusCsv" 
                input
                w-full
                rows="3"
                placeholder="participant_id_1,0.50&#10;participant_id_2,1.00&#10;..."
              ></textarea>

              <div flex gap-4 mt-4>
                <button
                  @click="applyCsvAdjustments"
                  btn-blue
                  :disabled="loading || !bonusCsv.trim()"
                >
                  Apply Adjustments
                </button>
                <button
                  @click="executeActions"
                  btn-green
                  :disabled="loading"
                >
                  Execute Actions
                </button>
                <button
                  @click="assignBonuses"
                  btn-purple
                  :disabled="loading || !!bonusCsv.trim()"
                >
                  Assign Bonuses
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="study.status === 'UNPUBLISHED'">
        <div>
          <h3 class="text-xl font-bold">Unpublished Study</h3>
          <p>This study is not published yet. You can publish it by clicking the "Publish Study" button.</p>
          <pre>{{ study.access_details }}</pre>
        </div>
      </div>
      <!-- Submissions Table -->
      <div v-else-if="allData.isMissing.value">
        failed to load submissions; check database
      </div>
      <div v-else-if="allData.isLoading.value">
        loading submissions...
      </div>
      <div v-else>
        <div flex="~ row gap-2 justify-between items-end" mb-2 mt-8>
          <div>
            <h3 class="text-xl font-bold">Submissions ({{ filteredSubmissions.length }} / {{ submissions.length }})</h3>
          </div>
          <div w-150>
            <div text-sm text-gray-600 mb--1>
              Filter: space is AND, comma is OR, ! negates, * is wildcard
            </div>
            <input
              v-model="searchQuery"
              type="text"
              input
              w-full
              mt-2
              placeholder="e.g. compl !appr"
            />
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-gray-200">
                <th px-2 py-2 text-left whitespace-nowrap>Session ID</th>
                <th px-2 py-2 text-left whitespace-nowrap>Participant ID</th>
                <th px-2 py-2 text-left whitespace-nowrap>Started</th>
                <th px-2 py-2 text-left whitespace-nowrap>Status</th>
                <th px-2 py-2 text-left whitespace-nowrap>Code</th>
                <th px-2 py-2 text-left whitespace-nowrap>Data</th>
                <th px-2 py-2 text-left whitespace-nowrap>Action</th>
                <th px-2 py-2 text-left whitespace-nowrap>Time</th>
                <th px-2 py-2 text-left whitespace-nowrap>Bonus
                  <span ml-2 text-gray-500 font-mono text-8pt>DB + ADJ = TOTAL</span>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="sub in filteredSubmissions" :key="sub.id">
                <!-- IDs -->
                <td px-2 py-2 whitespace-nowrap font-mono text-xs text-left>
                  <NuxtLink :to="`/data/sessions/${sub.id}`">
                    {{ sub.id }}
                  </NuxtLink>
                  <button
                    @click="copy(sub.id)"
                    class="i-mdi-clipboard-multiple ml-1 text-gray-500 hover:text-gray-700 cursor-pointer"
                    w-4 h-4
                  />
                </td>
                <td px-2 py-2 whitespace-nowrap font-mono text-xs text-left>
                  {{ sub.participant_id }}
                  <button
                    @click="copy(sub.participant_id)"

                    class="i-mdi-clipboard-multiple ml-1 text-gray-500 hover:text-gray-700 cursor-pointer"
                    w-4 h-4
                  />
                </td>
                <!-- Start Time -->
                <td px-2 py-2 whitespace-nowrap text-left>
                  {{ sub.started_at ? formatDateTime(sub.started_at) : 'never' }}
                </td>
                <!-- Submission Status -->
                <td px-2 py-2 whitespace-nowrap text-left >
                  <div :class="getSubmissionStatusColorClass(sub.status)" text-xs text-white rounded p-1 text-center w20>
                    {{ getSubmissionStatusLabel(sub.status) }}
                  </div>
                </td>
                <!-- Completion Code -->
                <td px-2 py-2 whitespace-nowrap font-mono font-bold text-xs text-left :class="getCodeColorClass(sub.study_code)">
                  {{ getCodeType(sub.study_code) }}
                </td>
                <!-- Data -->
                <td px-2 py-2 whitespace-nowrap text-left :class="getDataStatus(sub).color">
                  {{ getDataStatus(sub).text }}
                </td>
                <!-- Action -->
                <td px-2 py-2 whitespace-nowrap text-left>
                  <span v-if="isActionLocked(sub)" text-gray-400></span>
                  <select 
                    v-else 
                    v-model="selectedActions[sub.id]" 
                    @change="onActionChange(sub.id)"
                    input 
                    px-1 
                    py-0.5 
                    text-xs
                    :class="getActionColorClass(selectedActions[sub.id])"
                  >
                    <option v-if="selectedActions[sub.id] === null" :value="null"></option>
                    <option v-for="action in getPossibleActions(sub)" :key="action" :value="action">
                      {{ action }}
                    </option>
                  </select>
                </td>
                <!-- Time Taken -->
                <td px-2 py-2 whitespace-nowrap text-right>
                  {{ sub.time_taken ? formatTime(sub.time_taken * 1000) : 'N/A' }}
                </td>
                <!-- Bonus -->
                <td px-2 py-2 whitespace-nowrap font-mono text-sm flex items-center>
                  <span w-10 text-right>{{ databaseBonuses[sub.participant_id] ?? 0 }}</span>
                  <span mx-1>+</span>
                  <NumberInput
                    v-model="bonusAdjustments[sub.participant_id]"
                    :scroll-step="5"
                    :min="minAdjustments[sub.participant_id] ?? 0"
                    step="25"
                    input
                    font-mono
                    w-10
                    px-1
                  />
                  &nbsp;=
                  {{ intendedBonuses[sub.participant_id] ?? 0 }}
                  <span :class="getBonusStatus(sub).color" font-bold ml-auto w-15>
                    {{ getBonusStatus(sub).text }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>

</style>
  