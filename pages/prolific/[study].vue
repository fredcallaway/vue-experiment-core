<script setup lang="ts">


definePageMeta({
  layout: 'dashboard',
})
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

const bonusCsv = ref('')
const showImportModal = ref(false)

const applyCsvBonuses = () => {
  if (!bonusCsv.value.trim()) return

  const lines = bonusCsv.value.trim().split('\n')
  for (const line of lines) {
    const [id, bonus] = line.split(',')
    const sub = submissions.value.find(sub => sub.id === id || sub.participant_id === id)
    if (!sub) {
      alert(`Problem with line ${line}: submission not found`)
      return
    }
    const participantId = sub.participant_id
    if (id && bonus) {
      const val = parseFloat(bonus.trim())
      if (abs(val % 1) > 1e-6) {
        alert(`Problem with line ${line}: bonus is not a whole number (cents)`)
        return
      }
      bonusOverrides.value[participantId] = val
    }
  }
  bonusCsv.value = ''
  showImportModal.value = false
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

const groupedByAction = computed(() => {
  const submissionsToProcess = submissions.value
    .filter(sub => sub.status !== 'APPROVED')
    .map(sub => ({ id: sub.id, action: selectedActions.value[sub.id] }))
    .filter(item => item.action === 'approve' || item.action === 'return' || item.action === 'reject') as Array<{ id: string; action: 'approve' | 'return' | 'reject' }>

  return R.groupBy(submissionsToProcess, R.prop('action'))
})

const actionCounts = computed(() => {
  const notApproved = submissions.value.filter(sub => sub.status !== 'APPROVED')
  
  const none = notApproved.filter(sub => selectedActions.value[sub.id] === 'none').length
  const unspecified = notApproved.filter(sub => selectedActions.value[sub.id] === null).length

  return {
    approve: groupedByAction.value['approve']?.length ?? 0,
    return: groupedByAction.value['return']?.length ?? 0,
    reject: groupedByAction.value['reject']?.length ?? 0,
    none,
    unspecified,
  }
})

const getActionsSummary = () => {
  return Object.entries(actionCounts.value)
    .filter(([_, count]) => count > 0)
    .map(([action, count]) => `${action}: ${count}`)
    .join(', ')
}

const getActionsPromises = () => {
  const promises: Promise<any>[] = []
  const toExecute = R.mapValues(groupedByAction.value, subs => subs.map(sub => sub.id))
  
  if (toExecute.approve) {
    promises.push(prolific.approveSubmissions(studyId, toExecute.approve))
  }
  if (toExecute.return) {
    for (const id of toExecute.return) {
      promises.push(prolific.requestReturn(studyId, id))
    }
  }
  if (toExecute.reject) {
    for (const id of toExecute.reject) {
      promises.push(prolific.rejectSubmission(studyId, id))
    }
  }
  return promises
}

const showExecuteModal = ref(false)
const executeModalData = ref<{
  actionsSummary: string
  bonusesAmount: number
} | null>(null)
const executeStatus = ref<{ actions?: 'pending' | 'success' | 'error', bonuses?: 'pending' | 'success' | 'error', error?: string }>({})

const unpaidBonus = computed(() => totalIntendedBonus.value - totalPaidBonus.value)

const canExecute = computed(() => {
  const actions = actionCounts.value
  return actions.approve > 0 || actions.return > 0 || actions.reject > 0 || unpaidBonus.value > 0
})

const executeAll = () => {
  const actionsSummary = getActionsSummary()
  executeModalData.value = {
    actionsSummary,
    bonusesAmount: unpaidBonus.value,
  }
  executeStatus.value = {}
  showExecuteModal.value = true
}

const confirmExecute = wrap(async () => {
  if (!executeModalData.value) return

  executeStatus.value = { actions: 'pending', bonuses: 'pending' }
  
  try {
    const actionsPromises = getActionsPromises()
    await Promise.all(actionsPromises)
    executeStatus.value.actions = 'success'
  } catch (error) {
    executeStatus.value.actions = 'error'
    executeStatus.value.error = error instanceof Error ? error.message : String(error)
  }

  if (executeModalData.value.bonusesAmount > 0) {
    try {
      await prolific.assignBonuses(studyId, intendedBonuses.value, executeModalData.value.bonusesAmount)
      executeStatus.value.bonuses = 'success'
    } catch (error) {
      executeStatus.value.bonuses = 'error'
      if (!executeStatus.value.error) {
        executeStatus.value.error = error instanceof Error ? error.message : String(error)
      }
    }
  } else {
    executeStatus.value.bonuses = 'success'
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

const bonusOverrides = ref<Record<string, number | undefined>>({})

const currentBonuses = computed(() => {
  return R.pullObject(submissions.value, R.prop("participant_id"), sub => sum(sub.bonus_payments))
})

const defaultBonuses = computed(() => {
  return R.mapValues(currentBonuses.value, (current, participantId) => Math.max(current, databaseBonuses.value[participantId] ?? 0))
})

const intendedBonuses = computed(() => {
  return R.pullObject(submissions.value, R.prop("participant_id"), sub => {
    const override = bonusOverrides.value[sub.participant_id]
    return override !== undefined ? override : (defaultBonuses.value[sub.participant_id] ?? 0)
  })
})

const totalIntendedBonus = computed(() => {
  return R.sum(Object.values(intendedBonuses.value))
})

const totalPaidBonus = computed(() => {
  return R.sum(Object.values(currentBonuses.value))
})

const overrideStats = computed(() => {
  let count = 0
  let totalAdjustment = 0
  for (const sub of submissions.value) {
    const override = bonusOverrides.value[sub.participant_id]
    if (override !== undefined) {
      count++
      const database = databaseBonuses.value[sub.participant_id] ?? 0
      totalAdjustment += override - database
    }
  }
  return { count, totalAdjustment }
})


const bonusPaidStatus = computed(() => {
  if (submissions.value.length === 0) return { text: 'UNPAID', color: 'text-amber-500' }
  
  const unpaidAmount = totalIntendedBonus.value - totalPaidBonus.value
  if (unpaidAmount === 0) return { text: 'PAID', color: 'text-green-600' }
  if (totalPaidBonus.value === 0) return { text: 'UNPAID', color: 'text-red-600' }
  return { text: `UNPAID: ${formatCents(unpaidAmount)}`, color: 'text-amber-500' }
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
  if (current == 0) return {text: 'TODO', color: 'text-amber'}
  if (intended > current) return {text: 'UNDER', color: 'text-red-600'}
  return {text: 'PAID', color: 'text-green-600'}
}

const getBonusBorderColor = (participantId: string) => {
  const override = bonusOverrides.value[participantId]
  if (override === undefined) return ''
  const database = databaseBonuses.value[participantId] ?? 0
  if (override > database) return 'border-green-600'
  if (override < database) return 'border-red-600'
  return ''
}

const getBonusValue = (participantId: string) => {
  const override = bonusOverrides.value[participantId]
  return override ?? (defaultBonuses.value[participantId] ?? 0)
}

const setBonusValue = (participantId: string, value: number) => {
  const defaultVal = defaultBonuses.value[participantId] ?? 0
  if (value === defaultVal) {
    delete bonusOverrides.value[participantId]
  } else {
    bonusOverrides.value[participantId] = value
  }
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
  
  let result = submissions.value
  if (searchQuery.value.trim()) {
    const filter = createTextFilter(searchQuery.value)
    result = submissions.value.filter(sub => {
      const searchText = [
        sub.participant_id,
        sub.id,
        sub.status.replace('REVIEW', ''),
        sub.study_code || '',
        getCodeType(sub.study_code)
      ].join(' ')
      return filter(searchText)
    })
  }

  return [...result].sort((a, b) => {
    const aUncertain = selectedActions.value[a.id] === null ? 0 : 1
    const bUncertain = selectedActions.value[b.id] === null ? 0 : 1
    return aUncertain - bUncertain
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
          <h2>Recruitment</h2>

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
                btn-yellow
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

            <div mb-4>
              <h2>Review</h2>
              <div flex gap-3 items-center mb-2>
                <span font-bold>Approve:</span>
                <div>
                  <span mb-2 mr1 text-2xl i-mdi-check-circle text-green-600 />
                  <span text-lg >{{ actionCounts.approve }}</span>
                </div>
                <div>
                  <span mb-2 mr1 text-2xl i-mdi-arrow-left-circle text-orange-500 />
                  <span text-lg >{{ actionCounts.return }}</span>
                </div>
                <div>
                  <span mb-2 mr1 text-2xl i-mdi-close-circle text-red-600 />
                  <span text-lg >{{ actionCounts.reject }}</span>
                </div>
                <div>
                  <span mb-2 mr1 text-2xl i-mdi-minus-circle text-gray-500 />
                  <span text-lg >{{ actionCounts.none }}</span>
                </div>
                <div>
                  <span mb-2 mr1 text-2xl i-mdi-help-circle text-blue-600 />
                  <span text-lg >{{ actionCounts.unspecified }}</span>
                </div>
              </div>
              <div mb-2>
                <div flex items-center gap-2>
                  <span font-bold>Bonuses: {{ formatCents(totalIntendedBonus) }}</span>
                  <span :class="bonusPaidStatus.color" font-bold>
                    {{ bonusPaidStatus.text }}
                  </span>
                </div>
                <div v-if="overrideStats.count > 0">
                  Adjustments: {{ overrideStats.count }} ({{ formatCents(overrideStats.totalAdjustment) }})
                </div>
                <div v-else class="text-gray-400">
                  No adjustments
                </div>
              </div>
              <button
                @click="executeAll"
                btn-blue
                :disabled="!canExecute"
              >
                Execute
              </button>
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
                <th px-2 py-2 text-left whitespace-nowrap>
                  <div flex items-center gap-2>
                    <span>Bonus</span>
                    <button
                      @click="showImportModal = true"
                      btn-xs
                      class="font-400"
                      :disabled="loading"
                    >
                      import
                    </button>
                  </div>
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
                  <NumberInput
                    :modelValue="getBonusValue(sub.participant_id)"
                    :default="defaultBonuses[sub.participant_id]"
                    @update:modelValue="(val) => setBonusValue(sub.participant_id, val)"
                    :scroll-step="5"
                    :min="currentBonuses[sub.participant_id] ?? 0"
                    step="25"
                    input
                    font-mono
                    w-10
                    px-1
                    border-2
                    :class="getBonusBorderColor(sub.participant_id)"
                  />
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

    <!-- Import Bonuses Modal -->
    <div
      v-if="showImportModal"
      fixed
      inset-0
      z-50
      flex
      items-center
      justify-center
      bg-black
      bg-opacity-50
      @click.self="showImportModal = false"
    >
      <div bg-white rounded-lg p-6 max-w-lg w-full mx-4>
        <div flex justify-between items-center mb-4>
          <h3 class="text-xl font-semibold">Import Bonuses</h3>
          <button
            @click="showImportModal = false"
            class="text-gray-500 hover:text-gray-700"
          >
            <span i-mdi-close text-2xl />
          </button>
        </div>
        <label class="block mb-2 font-semibold">CSV: participant_id,bonus (cents)</label>
        <textarea 
          v-model="bonusCsv" 
          input
          w-full
          rows="6"
          placeholder="participant_id_1,50&#10;participant_id_2,100&#10;..."
        ></textarea>
        <div flex gap-4 mt-4 justify-end>
          <button
            @click="showImportModal = false"
            btn-gray
          >
            Cancel
          </button>
          <button
            @click="applyCsvBonuses"
            btn-blue
            :disabled="loading || !bonusCsv.trim()"
          >
            Apply Bonuses
          </button>
        </div>
      </div>
    </div>

    <!-- Execute Actions Modal -->
    <div
      v-if="showExecuteModal && executeModalData"
      fixed
      inset-0
      z-50
      flex
      items-center
      justify-center
      bg-black
      bg-opacity-50
      @click.self="showExecuteModal = false"
    >
      <div bg-white rounded-lg p-6 max-w-lg w-full mx-4>
        <div flex justify-between items-center mb-4>
          <h3 class="text-xl font-semibold">Execute Actions</h3>
          <button
            v-if="executeStatus.actions === undefined && executeStatus.bonuses === undefined"
            @click="showExecuteModal = false"
            class="text-gray-500 hover:text-gray-700"
          >
            <span i-mdi-close text-2xl />
          </button>
        </div>
        
        <div v-if="executeStatus.actions === undefined && executeStatus.bonuses === undefined" mb-4>
          <div mb-2>
            <div font-bold mb-1>Actions:</div>
            <div v-if="executeModalData.actionsSummary">{{ executeModalData.actionsSummary }}</div>
            <div v-else class="text-gray-400">No actions</div>
          </div>
          <div mb-2>
            <div font-bold mb-1>Bonuses:</div>
            <div v-if="executeModalData.bonusesAmount > 0">
              {{ formatCents(executeModalData.bonusesAmount) }}
            </div>
            <div v-else class="text-gray-400">
              No bonuses to assign
            </div>
          </div>
        </div>

        <div v-else mb-4>
          <div mb-2>
            <div font-bold mb-1>Actions:</div>
            <div flex items-center gap-2>
              <span v-if="executeStatus.actions === 'pending'" class="text-gray-500">Processing...</span>
              <span v-else-if="executeStatus.actions === 'success' && executeModalData.actionsSummary" class="text-green-600">✓ Success</span>
              <span v-else-if="executeStatus.actions === 'success'" class="text-gray-400">Skipped</span>
              <span v-else-if="executeStatus.actions === 'error'" class="text-red-600">✗ Error</span>
            </div>
          </div>
          <div mb-2>
            <div font-bold mb-1>Bonuses:</div>
            <div flex items-center gap-2>
              <span v-if="executeStatus.bonuses === 'pending'" class="text-gray-500">Processing...</span>
              <span v-else-if="executeStatus.bonuses === 'success' && executeModalData.bonusesAmount > 0" class="text-green-600">✓ Success</span>
              <span v-else-if="executeStatus.bonuses === 'success'" class="text-gray-400">Skipped</span>
              <span v-else-if="executeStatus.bonuses === 'error'" class="text-red-600">✗ Error</span>
            </div>
          </div>
          <div v-if="executeStatus.error" class="text-red-600 text-sm mt-2">
            {{ executeStatus.error }}
          </div>
        </div>

        <div flex gap-4 justify-end>
          <button
            v-if="executeStatus.actions === undefined && executeStatus.bonuses === undefined"
            @click="showExecuteModal = false"
            btn-gray
          >
            Cancel
          </button>
          <button
            v-if="executeStatus.actions === undefined && executeStatus.bonuses === undefined"
            @click="confirmExecute"
            btn-blue
            :disabled="loading"
          >
            Confirm
          </button>
          <button
            v-if="executeStatus.actions !== undefined && (executeStatus.bonuses !== undefined || executeModalData.bonusesAmount === 0)"
            @click="showExecuteModal = false"
            btn-blue
          >
            Close
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>

</style>
  