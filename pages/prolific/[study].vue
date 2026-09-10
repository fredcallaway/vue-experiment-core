<script setup lang="ts">
import {
  getCompletionCodeType,
  getDefaultReviewAction,
  getOutstandingBonusCents,
  getReviewDataStatus,
} from '~/core/operations/review'

definePageMeta({
  layout: 'dashboard',
})
const route = useRoute()
const studyId = route.params.study as string
const prolific = useProlific()
const { loading, error, wrap} = useAsyncRunner()
const prolificMessages = useProlificMessages()

// ===== messaging ===========================================================

const messageModalParticipantId = ref<string | null>(null)
const messageModalLoading = ref(false)

const getMessageStatus = (participantId: string) => {
  const correspondence = prolificMessages.getCorrespondence(studyId, participantId)
  if (!correspondence || !correspondence.messages?.length) return 'none'
  return correspondence.resolved ? 'resolved' : 'unresolved'
}

const getMessageIconClass = (participantId: string) => {
  const status = getMessageStatus(participantId)
  switch (status) {
    case 'unresolved': return 'i-mdi-message-alert text-amber-500'
    case 'resolved': return 'i-mdi-message-check text-green-600'
    case 'none': return 'i-mdi-message-outline text-gray-400'
  }
}

const openMessageModal = async (participantId: string) => {
  messageModalParticipantId.value = participantId
  messageModalLoading.value = true
  try {
    prolificMessages.getOrCreateCorrespondence(studyId, participantId)
  } finally {
    messageModalLoading.value = false
  }
}

const closeMessageModal = () => {
  messageModalParticipantId.value = null
}

const messageModalCorrespondence = computed(() => {
  if (!messageModalParticipantId.value) return null
  return prolificMessages.getCorrespondence(studyId, messageModalParticipantId.value)
})

// Reactive cache
const studyCache = prolific.getStudyCache(studyId)
const { fullItem: study, error: studyError } = studyCache

// ===== auto-refresh study cache =============================================

const isWindowFocused = useWindowFocus()
const { idle } = useIdle(60000)

const isActiveForRefresh = computed(() =>
  study.value?.status === 'ACTIVE' && isWindowFocused.value && !idle.value
)

const { pause: pauseStudyRefresh, resume: resumeStudyRefresh } = useIntervalFn(() => {
  studyCache.refresh()
}, 5000, { immediate: false })

watch(isActiveForRefresh, (isActive) => {
  if (isActive) {
    console.log('refreshing study cache')
    studyCache.refresh()
    resumeStudyRefresh()
    return
  }
  pauseStudyRefresh()
}, { immediate: true })

const submissions = computed(() => study.value?.submissions ?? [])

onMounted(() => {
  // check for new *received* messages
  prolificMessages.refresh()
  // check for messages prolific sent for us (not picked up by refresh)
  watchOnce(submissions, (subs) => {
    if (!subs || subs.length === 0) return
    
    for (const sub of subs) {
      const codeType = getCodeType(sub.study_code)
      if (sub.status == 'APPROVED') continue
      
      // Refresh if: code type is not COMPLETED or NOCODE
      // OR status is AWAITING REVIEW and code type is not COMPLETED
      const shouldRefresh = 
        (codeType !== 'COMPLETED' && codeType !== 'NOCODE') ||
        (sub.status === 'AWAITING REVIEW' && codeType !== 'COMPLETED')
      
      if (shouldRefresh) {
        prolificMessages.refreshCorrespondence(studyId, sub.participant_id)
      }
    }
  })
})

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
  await useStudies().publishStudy(studyId)
})

const { copy } = useClipboard()

const newPlaces = ref(0)
const addPlaces = wrap(async () => {
  const toAdd = newPlaces.value
  if (toAdd <= 0) return `No places to add`
  await prolific.addPlaces(studyId, toAdd)
  newPlaces.value = 0
  return `Added ${toAdd} places`
})

const assignmentsToReplace = computed(() => {
  if (!sessions.value) return {}
  if (!study.value?.access_details) return {}

  const accessDetails = study.value.access_details
  const replacementsPosted = accessDetails.map(detail => detail.total_allocation - 1)
  assert(replacementsPosted.every(n => Number.isInteger(n) && n >= 0), 'Invalid access_details total_allocation')

  const invalidCounts = submissions.value
    .filter(sub => sub.status === 'APPROVED')
    .map(sub => {
      const session = sessionsBySessionId.value[sub.id]
      if (!session) throw new Error(`Missing session meta for submission ${sub.id}`)
      return { submission: sub, session }
    })
    .filter(({ session, submission }) => (
      session.excluded ||
      sessionStatus(session) !== 'completed' ||
      getDataStatus(submission).text !== 'full'
    ))
    .reduce<Record<number, number>>((acc, { session }) => {
      const assignment = session.assignment
      assert(assignment >= 0 && assignment < accessDetails.length, `Invalid assignment ${assignment}`)
      acc[assignment] = (acc[assignment] ?? 0) + 1
      return acc
    }, {})

  return accessDetails.reduce<Record<number, number>>((acc, _, index) => {
    const remaining = (invalidCounts[index] ?? 0) - (replacementsPosted[index] ?? 0)
    if (remaining > 0) acc[index] = remaining
    return acc
  }, {})
})

const assignmentsToReplaceSummary = computed(() => {
  return Object.entries(assignmentsToReplace.value)
    .map(([assignment, count]) => ({ assignment: Number(assignment), count }))
    .sort((a, b) => a.assignment - b.assignment)
})

const totalAssignmentsToReplace = computed(() => {
  return R.sum(Object.values(assignmentsToReplace.value))
})

const replaceInvalidAssignments = wrap(async () => {
  if (confirm(`Post ${totalAssignmentsToReplace.value} new places?`)) {
    const { replaced } = await prolific.replaceAssignments(studyId, assignmentsToReplace.value)
    return `Posted ${replaced} new places`
  }
  throw new Error('User cancelled - no assignments replaced')
})

// ===== bonuses ============================================================

const bonusCsv = ref('')
const showImportModal = ref(false)

const applyCsvBonuses = async () => {
  if (!bonusCsv.value.trim()) return

  const overrides: Record<string, number> = {}
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
      overrides[participantId] = val
    }
  }
  await setBonusOverrides(overrides)
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

const getActiveTimeText = (sub: Submission) => {
  const session = sessionsBySessionId.value[sub.id]
  if (!session) return 'N/A'
  const activeMs = getSessionTimeInfo(session).activeMs
  return activeMs === null ? 'N/A' : formatTime(activeMs)
}

const getDataStatus = (sub: Submission) => {
  const session = sessionsBySessionId.value[sub.id]
  const text = getReviewDataStatus(sub, session, study.value?.completion_codes ?? [])
  if (text === 'full') return { text, color: 'text-green-600' }
  if (text === 'partial') return { text, color: 'text-amber' }
  if (text === 'minimal' && sub.status !== 'RETURNED') {
    return { text, color: 'text-red-600' }
  }
  return { text, color: 'text-gray-400' }
}

const getCodeType = (studyCode: string | null | undefined) => {
  return getCompletionCodeType(studyCode, study.value?.completion_codes ?? [])
}


// ===== actions column ======================================================

type SubmissionAction = ProlificReviewAction | null

const selectedActions = ref<Record<string, SubmissionAction>>({})
const {
  actionOverrides,
  bonusOverrides,
  isLoading: reviewDraftLoading,
  setActionOverride,
  setBonusOverride,
  setBonusOverrides,
} = useProlificReviewDraft(studyId)

const getPossibleActions = (sub: Submission) => {
  switch (sub.status) {
    case 'AWAITING REVIEW': return ['approve', 'return', 'reject', 'none']
    case 'RETURNED': return ['approve', 'none']
    case 'TIMED-OUT': return ['approve', 'none']
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
  return getDefaultReviewAction(sub, getDataStatus(sub).text, study.value?.completion_codes ?? [])
}

watch([submissions, sessions, actionOverrides], () => {
  for (const sub of submissions.value) {
    const override = actionOverrides.value[sub.id]
    selectedActions.value[sub.id] = override !== undefined ? override : getDefaultAction(sub)
  }
})

const onActionChange = async (submissionId: string) => {
  const sub = submissions.value.find(item => item.id === submissionId)
  if (!sub) throw new Error(`Unknown submission ID: ${submissionId}`)
  
  const selected = selectedActions.value[submissionId]
  const defaultAction = getDefaultAction(sub)
  if (selected === null || selected === defaultAction) {
    await setActionOverride(submissionId, null)
    return
  }
  await setActionOverride(submissionId, selected)
}

const clearActionOverride = async (submissionId: string) => {
  const sub = submissions.value.find(item => item.id === submissionId)
  if (!sub) throw new Error(`Unknown submission ID: ${submissionId}`)
  
  await setActionOverride(submissionId, null)
  selectedActions.value[submissionId] = getDefaultAction(sub)
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

type ReviewActions = Record<'approve' | 'return' | 'reject', string[]>

const getReviewActions = (): ReviewActions => ({
  approve: groupedByAction.value.approve?.map(item => item.id) ?? [],
  return: groupedByAction.value.return?.map(item => item.id) ?? [],
  reject: groupedByAction.value.reject?.map(item => item.id) ?? [],
})

const getActionsPromises = (toExecute: ReviewActions) => {
  const promises: Promise<any>[] = []
  
  if (toExecute.approve.length > 0) {
    promises.push(prolific.approveSubmissions(studyId, toExecute.approve))
  }
  if (toExecute.return.length > 0) {
    for (const id of toExecute.return) {
      promises.push(prolific.requestReturn(studyId, id))
    }
  }
  if (toExecute.reject.length > 0) {
    for (const id of toExecute.reject) {
      promises.push(prolific.rejectSubmission(studyId, id))
    }
  }
  return promises
}

const unpaidBonus = computed(() => totalIntendedBonus.value - totalPaidBonus.value)

const canExecute = computed(() => {
  if (reviewDraftLoading.value) return false
  const actions = actionCounts.value
  return actions.approve > 0 || actions.return > 0 || actions.reject > 0 || unpaidBonus.value > 0
})

const joinAnd = (parts: string[]) => {
  if (parts.length === 1) return parts[0]
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`
  return `${parts.slice(0, -1).join(', ')}, and ${parts.at(-1)}`
}

const executeHandlesAllReviewableSessions = () => {
  return submissions.value.every(sub => {
    if (getDefaultAction(sub) === 'none') return true
    if (isActionLocked(sub)) return true
    const action = selectedActions.value[sub.id]
    return action === 'approve' || action === 'return' || action === 'reject'
  })
}

const executeAll = async () => {
  if (!study.value) throw new Error('Study not loaded')
  const counts = actionCounts.value
  const actions = getReviewActions()
  const bonusesAmount = unpaidBonus.value
  const bonuses = R.clone(intendedBonuses.value)
  const actionsPromises = getActionsPromises(actions)
  const willComplete = executeHandlesAllReviewableSessions()
    && (counts.approve + counts.return + counts.reject > 0)
  const willCompleteBonuses = study.value.status === 'COMPLETED' && bonusesAmount > 0
  const shouldShowPending = willComplete || willCompleteBonuses

  const parts = [
    counts.approve > 0 && 'approved',
    counts.return > 0 && 'returned',
    counts.reject > 0 && 'rejected',
    bonusesAmount > 0 && 'bonused',
  ].filter(Boolean) as string[]
  if (parts.length === 0) throw new Error('Nothing to execute')

  if (shouldShowPending) prolific.markPendingComplete(studyId)

  const errors: string[] = []
  try {
    await Promise.all(actionsPromises)
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error))
  }
  if (bonusesAmount > 0) {
    try {
      await prolific.assignBonuses(studyId, bonuses, bonusesAmount)
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error))
    }
  }
  if (errors.length) {
    if (shouldShowPending) prolific.clearPendingComplete(studyId)
    throw new Error(errors.join('; '))
  }

  return `${study.value.internal_name} ${joinAnd(parts)}`
}

const executeSuccess = (message: string) => message

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

const currentBonuses = computed(() => {
  return R.pullObject(submissions.value, R.prop("participant_id"), sub => sum(sub.bonus_payments))
})

const shouldUseDatabaseBonus = (sub: Submission) => {
  const selectedAction = selectedActions.value[sub.id]
  const dataStatus = getDataStatus(sub).text
  const currentStatus = sub.status
  
  return selectedAction === 'approve' ||
    dataStatus === 'full' ||
    currentStatus === 'APPROVED'
}

const defaultBonuses = computed(() => {
  return R.mapValues(currentBonuses.value, (current, participantId) => {
    const sub = submissions.value.find(s => s.participant_id === participantId)
    if (!sub) return current
    
    const dbBonus = shouldUseDatabaseBonus(sub) ? (databaseBonuses.value[participantId] ?? 0) : 0
    return Math.max(current, dbBonus)
  })
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

const totalOutstandingBonus = computed(() => {
  return getOutstandingBonusCents(submissions.value, intendedBonuses.value)
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

  if (totalOutstandingBonus.value === 0) return { text: 'PAID', color: 'text-green-600' }
  if (totalPaidBonus.value === 0) return { text: 'UNPAID', color: 'text-red-600' }
  return { text: `UNPAID: ${formatCents(totalOutstandingBonus.value)}`, color: 'text-amber-500' }
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
    case 'DISCONNECTED': return 'text-yellow-500'
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
  
  // Check if database bonus was zeroed out for incomplete sessions
  const dbBonus = databaseBonuses.value[sub.participant_id] ?? 0
  if (dbBonus > 0 && !shouldUseDatabaseBonus(sub)) {
    return {text: `(${dbBonus})`, color: 'text-gray-400'}
  }
  
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

const setBonusValue = async (participantId: string, value: number) => {
  const defaultVal = defaultBonuses.value[participantId] ?? 0
  if (value === defaultVal) {
    await setBonusOverride(participantId, null)
  } else {
    await setBonusOverride(participantId, value)
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

  // const bonus = R.pipe(sv.submissions, R.map(sub => sum(sub.bonus_payments)), R.sum())
  const bonus = sum(R.values(intendedBonuses.value))
  const total = PROLIFIC_FEE * (base + bonus)
  // return `${PROLIFIC_FEE} × (${formatCents(base)} + ${formatCents(bonus)}) = ${formatCents(total)}`
  return `${formatCents(base)} (base) + ${formatCents(bonus)} (bonus) × 4/3 (prolific) = ${formatCents(total)}`
})

const averageBonus = computed(() => {
  const eligible = submissions.value.filter(sub => {
    const dataStatus = getDataStatus(sub).text
    const codeType = getCodeType(sub.study_code)
    return dataStatus === 'full' && codeType === 'COMPLETED'
  })
  
  if (eligible.length === 0) return null
  
  const bonuses = eligible.map(sub => intendedBonuses.value[sub.participant_id] ?? 0)
  return R.sum(bonuses) / eligible.length
})

const searchQuery = ref('')
const filteredSubmissions = computed(() => {
  if (submissions.value.length === 0) return []
  
  let result = submissions.value
  if (searchQuery.value.trim()) {
    const filter = createTextFilter(searchQuery.value)
    result = submissions.value.filter(sub => {
      const startedText = sub.started_at ? formatDateTime(sub.started_at) : 'never'
      const statusText = getSubmissionStatusLabel(sub.status)
      const timeText = sub.time_taken ? formatTime(sub.time_taken * 1000) : 'N/A'
      const bonusValue = getBonusValue(sub.participant_id)
      const bonusStatus = getBonusStatus(sub).text
      const searchText = [
        sub.id,
        sub.participant_id,
        startedText,
        statusText,
        sub.status.replace('REVIEW', ''),
        sub.study_code || '',
        getCodeType(sub.study_code),
        getDataStatus(sub).text,
        selectedActions.value[sub.id],
        timeText,
        bonusValue,
        bonusStatus
      ].join(' ')
      return filter(searchText)
    })
  }
  return R.sortBy(result, 
  (sub) => Number(getDefaultAction(sub) !== null),
  (sub) => sub.id,
  )
})

const versions = computed(() => {
  if (!sessions.value) return []
  return R.unique(Object.values(sessions.value).map(session => session.version))
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
            <div>
              <b>Data Version: </b>
              <div v-for="version in versions" :key="version" flex gap-4 inline>
                <NuxtLink :to="`/data/versions/${version}`">
                  {{ version }}
                </NuxtLink>
              </div>
            </div>
            <div><b>Status:</b> {{ prolific.displayStudyStatus(study, totalOutstandingBonus > 0) }}</div>
            <div><b>Study ID:</b> {{ study.id }}</div>
            <div><b>Reward:</b> ${{ (study.reward / 100).toFixed(2) }}</div>
            <div><b>Places:</b> {{ study.places_taken ?? 0 }} / {{ study.total_available_places }}</div>


            <div><b>Estimated Time:</b> {{ study.estimated_completion_time }} min</div>
            <div><b>Cost:</b> {{ costString }}</div>
            <div><b>Average Bonus:</b> {{ averageBonus !== null ? formatCents(averageBonus) : 'N/A' }}</div>
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
              <ActionButton 
                name="Publish Study" :action="publishStudy" success
                btn-green
                :disabled="loading"
              />

              <ActionButton 
                name="Delete Study" :action="deleteStudy" success
                btn-red
                :disabled="loading"
              />
          </div>

          <!-- Published Study Actions -->
          <div v-else>
            <div flex gap-2 mb-4 items-center>
              
              <!-- set status -->
              <ActionButton 
                v-if="study.status === 'ACTIVE'" 
                name="Pause Study" :action="pauseStudy" success
                btn-yellow
                :disabled="loading"
              />
              <ActionButton 
                v-if="study.status === 'PAUSED'" 
                name="Start Study" :action="startStudy" success
                btn-green
                :disabled="loading"
              />
              <ActionButton 
                v-if="study.status !== 'COMPLETED'"
                name="Stop Study" :action="stopStudy" success
                btn-red
                :disabled="loading"
              />

              <!-- add places -->
              <ActionButton 
                name="Add Places" :action="addPlaces" success="result"
                btn-blue
                :disabled="loading || newPlaces <= 0"
              />
              <NumberInput 
                v-model="newPlaces" 
                :scroll-step="1"
                :min="0"
                text-xl
                input
                w-20
                step="10"
              />
            </div>

            <!-- invalid assignment replacement -->
            <div v-if="totalAssignmentsToReplace > 0" mb-4>
              <div font-bold>Found {{ totalAssignmentsToReplace }} approved submissions with incomplete data</div>
              <div text-sm v-for="item in assignmentsToReplaceSummary" :key="item.assignment">
                {{ item.assignment }}: {{ item.count }}
              </div>
              <ActionButton
                name="Replace Incomplete Assignments"
                :action="replaceInvalidAssignments"
                success="result"
                btn-blue
                :disabled="loading || totalAssignmentsToReplace === 0"
              />
            </div>
            <!-- <div v-else>
              <div font-italic text-sm mb-4 mt--2>No incomplete assignments found</div>
            </div> -->

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
              <ActionButton
                name="Execute" :action="executeAll"
                loading
                :success="executeSuccess"
                btn-blue
                :disabled="!canExecute"
              />
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
                <th px-2 py-2 text-left whitespace-nowrap>Time (total/active)</th>
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
                  <button
                    @click="openMessageModal(sub.participant_id)"
                    :class="getMessageIconClass(sub.participant_id)"
                    class="ml-1 cursor-pointer hover:opacity-70"
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
                  <div w-25 mr--5>
                    <span v-if="isActionLocked(sub)" text-gray-400></span>
                    <select
                      v-else
                      v-model="selectedActions[sub.id]"
                      @change="onActionChange(sub.id)"
                      input
                      cursor-pointer
                      px-1
                      py-0.5
                      text-xs
                      :disabled="reviewDraftLoading"
                      :class="getActionColorClass(selectedActions[sub.id])"
                    >
                      <option v-if="selectedActions[sub.id] === null" :value="null"></option>
                      <option v-for="action in getPossibleActions(sub)" :key="action" :value="action">
                        {{ action }}
                      </option>
                    </select>
                    <button
                      v-if="(actionOverrides[sub.id] !== undefined) && sub.status !== 'APPROVED'"
                      @click="clearActionOverride(sub.id)"
                      class="i-mdi-undo-variant"
                      title="Clear override"
                      ml-1
                      :class="getActionColorClass(getDefaultAction(sub))"
                      
                    />
                  </div>
                </td>
                <!-- Time Taken -->
                <td px-2 py-2 whitespace-nowrap text-right>
                  <div>{{ sub.time_taken ? formatTime(sub.time_taken * 1000) : 'N/A' }}</div>
                  <div class="text-xs text-gray-500">active: {{ getActiveTimeText(sub) }}</div>
                </td>
                <!-- Bonus -->
                <td px-2 py-2 whitespace-nowrap font-mono text-sm flex items-center>
                  <NumberInput
                    :modelValue="getBonusValue(sub.participant_id)"
                    :default="defaultBonuses[sub.participant_id]"
                    @update:modelValue="(val) => setBonusValue(sub.participant_id, val)"
                    :scroll-step="5"
                    :min="currentBonuses[sub.participant_id] ?? 0"
                    :disabled="reviewDraftLoading"
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
            :disabled="loading || reviewDraftLoading || !bonusCsv.trim()"
          >
            Apply Bonuses
          </button>
        </div>
      </div>
    </div>

    <!-- Message Modal -->
    <div
      v-if="messageModalParticipantId"
      fixed
      inset-0
      z-50
      flex
      items-center
      justify-center
      bg-black
      bg-opacity-50
      @click.self="closeMessageModal"
    >
      <div v-if="messageModalCorrespondence" >
        <ProlificMessageBox
          :correspondence="messageModalCorrespondence"
          show-session-link
        />
      </div>
    </div>
  </div>
</template>

<style scoped>

</style>
  
