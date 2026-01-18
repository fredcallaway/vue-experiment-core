import '~/prolific.config.ts'

const PAGE_SIZE = 5
const API_INTERVAL = 1000
const API_CONCURRENCY_LIMIT = 3

export const useProlific = createGlobalState(() => {
  const prolificConfig = getProlificConfig()
  const token = ref('')
  const projectId = ref(prolificConfig.projectId)

  const loadToken = async () => {
    try {
      const response = await fetch('/api/prolific/token')
      const data = await response.json()
      token.value = data.token || ''
    } catch (error) {
      console.error('Failed to load token:', error)
      token.value = ''
    }
  }

  const setToken = async (newToken: string) => {
    try {
      await fetch('/api/prolific/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: newToken })
      })
      token.value = newToken.trim()
    } catch (error) {
      throw new ProlificError(`Failed to save token: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  loadToken()

  const baseRequest = async (method: string, path: string, body?: any) => {
    const now = performance.now()

    path = path.startsWith('/') ? path.slice(1) : path
    const proxyUrl = `/api/prolific/${path}`
    try {
      const response = await fetch(proxyUrl, {
        method,
        headers: {
          'X-Prolific-Token': token.value,
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      })
      console.debug('API request response', { method, path, body, response, time: performance.now() - now })
      return response
    } catch (error) {
      console.error('API request failed', { method, path, body, error, time: performance.now() - now })
      throw new ProlificError(`API request failed: ${error}`)
    }
  }

  const status = ref<('unknown' | 'ok' | 'invalidToken' | 'invalidProjectId')>('unknown')

  watchImmediate([token, projectId], async ([_, newProjectId]) => {
    console.log('checking status', token.value, newProjectId)
    status.value = 'unknown'
    if (token.value.length < 10) {
      status.value = 'invalidToken'
      return
    } else if (newProjectId.length < 10) {
      status.value = 'invalidProjectId'
      return
    }
    const result = await baseRequest('GET', `/projects/${newProjectId}`)
    if (result.ok) {
      status.value = 'ok'
      if (prolificConfig.projectId !== newProjectId) {
        prolificConfig.projectId = newProjectId
        await writeProlificConfig(prolificConfig)
      }
    } else if (result.status === 401) {
      status.value = 'invalidToken'
    } else if (result.status == 404) {
      status.value = 'invalidProjectId'
    } else {
      console.error('Prolific status check failed', result)
    }
  })

  // Request queue system
  type QueuedRequest<T> = {
    method: string
    path: string
    body?: any
    resolve: (value: T) => void
    reject: (error: any) => void
  }

  const requestQueue = ref<QueuedRequest<any>[]>([])
  const runningCount = ref(0)

  const processRequest = async <T>(queued: QueuedRequest<T>): Promise<void> => {
    try {
      await Promise.any([
        until(status).toBe('ok'),
        timeoutPromise(2000)
      ])
      if (status.value !== 'ok') {
        throw new ProlificError('invalid status: ' + status.value)
      }
      const response = await baseRequest(queued.method, queued.path, queued.body)

      if (response.status === 204) {
        queued.resolve({} as T)
        return
      }

      const responseText = await response.text()
      let data: any

      if (responseText.trim()) {
        try {
          data = JSON.parse(responseText)
        } catch {
          data = { info: responseText }
        }
      } else {
        data = {}
      }

      if (!response.ok) {
        const msg = `API Error: ${queued.method} ${queued.path}\nStatus: ${response.status}\nResponse: ${JSON.stringify(data, null, 2)}`
        throw new ProlificError(msg)
      }

      queued.resolve(data)
    } catch (error) {
      queued.reject(error)
    }
  }

  const processQueue = async () => {
    while (requestQueue.value.length > 0 && runningCount.value < API_CONCURRENCY_LIMIT) {
      const queued = requestQueue.value.shift()
      if (!queued) break

      runningCount.value++
      processRequest(queued).finally(() => {
        runningCount.value--
      })
    }
  }

  // Start queue processor
  const { pause, resume } = useIntervalFn(processQueue, API_INTERVAL)
  resume()

  const request = async <T>(method: string, path: string, body?: any): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
      requestQueue.value.push({ method, path, body, resolve, reject })
      // Try to process immediately if under concurrency limit
      if (runningCount.value < API_CONCURRENCY_LIMIT) {
        processQueue()
      }
    })
  }

  const fetchStudies = async ({page = null as number | null, status = null as string | null}): Promise<{ results: StudyShort[], meta: { count: number } }> => {
    let query = 'ordering=-date_created'
    if (page) {
      query += `&page_size=${PAGE_SIZE}&page=${page}`
    }
    if (status) {
      query += `&status=${status}`
    }
    // const query = `&page=${page}&page_size=${PAGE_SIZE}`
    const response = await request<{ results: any[], meta: { count: number }, _links?: { next?: { href?: string } } }>(
      'GET',
      `/projects/${projectId.value}/studies?${query}`
    )
    return {
      results: response.results.map((s: any) => ProlificStudyShortSchema.parse(s)),
      meta: response.meta
    }
  }

  // Async generator for study list
  const fetchStudyList = async function*(): AsyncGenerator<StudyShort[], void, unknown> {
    // 1. First page of -date_created (immediate)
    const firstPageResponse = await fetchStudies({ page: 1 })
    yield firstPageResponse.results

    // Calculate max page based on total count
    const maxPage = Math.ceil(firstPageResponse.meta.count / PAGE_SIZE)

    // 2. Status queries in parallel
    const statusQueries = [
      fetchStudies({ status: 'AWAITING REVIEW' }),
      fetchStudies({ status: 'ACTIVE' }),
      fetchStudies({ status: 'PAUSED' })
    ]

    for (const promise of statusQueries) {
      const response = await promise
      if (response.results.length > 0) {
        yield response.results
      }
    }

    // 3. Remaining -date_created pages
    let page = 2
    const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000

    while (page <= maxPage) {
      const pageResponse = await fetchStudies({ page })

      if (pageResponse.results.length === 0) break

      yield pageResponse.results

      // Check if all studies in this page are old
      const allOld = pageResponse.results.every(s =>
        new Date(s.date_created).getTime() < twoWeeksAgo
      )

      if (allOld) {
        console.debug('Early stop: all studies in page older than 2 weeks')
        break
      }

      page++
    }
  }

  // Fetch individual study with submissions
  const fetchStudy = async (studyId: string): Promise<StudyFull> => {
    const [studyResponse, submissionsResponse] = await Promise.all([
      request<any>('GET', `/studies/${studyId}`),
      request<{ results: any[] }>('GET', `/studies/${studyId}/submissions`)
    ])

    const study = ProlificStudyDetailsSchema.parse(studyResponse)
    const submissions = submissionsResponse.results.map((s: any) =>
      ProlificSubmissionSchema.parse(s)
    )

    return {
      ...study,
      submissions
    }
  }

  // Create cache
  const studiesCache = useAsyncListCache<StudyShort, StudyFull>({
    storageKey: `prolific_studies_${projectId.value}`,
    fetchList: fetchStudyList,
    fetchItem: fetchStudy,
    getItemId: (study) => study.id,
    minRefreshInterval: 60_000,  // 60s
  })

  // Get list interface with sorting
  const studyList = computed(() => {
    const list = studiesCache.getListCache()

    const statusPriority: Record<string, number> = {
      'AWAITING REVIEW': 0,
      'ACTIVE': 1,
      'PAUSED': 2,
    }

    const sortedItems = computed(() => {
      return [...list.items.value].sort((a, b) => {
        // First by status priority
        const priorityA = statusPriority[a.status] ?? 999
        const priorityB = statusPriority[b.status] ?? 999
        if (priorityA !== priorityB) return priorityA - priorityB

        // Then by date (newest first)
        return new Date(b.date_created).getTime() - new Date(a.date_created).getTime()
      })
    })

    return {
      items: sortedItems,
      timestamp: list.timestamp,
      isLoading: list.isLoading,
      refresh: list.refresh,
    }
  })

  // Get individual study
  const getStudyCache = (studyId: string) => {
    return studiesCache.getItemCache(studyId)
  }

  interface WatchStudyOptions {
    interval?: number
    maxCall?: number
    callback: (study: StudyFull) => boolean | void  // return true to stop watch
  }
  const watchStudy = (studyId: string, options: WatchStudyOptions) => {
    console.log('👉 watchStudy', studyId)
    const interval = ref(options.interval ?? 5_000)
    const studyCache = studiesCache.getItemCache(studyId)

    const { pause, resume, isActive } = useIntervalFn(async () => {
      if ((studyCache.timestamp.value || 0) < Date.now() - interval.value) {
        await studyCache.refresh()
      }
      const study = assertDefined(studyCache.fullItem.value)
      if (study && options.callback) {
        const shouldStop = options.callback(study)
        if (shouldStop) {
          pause()
        }
      }
      return false
    }, interval)

    watch(useIdle().idle, (isIdle) => {
      if (isIdle) {
        interval.value = Math.max(interval.value, 60_000)
      } else {
        interval.value = options.interval ?? 5_000
      }
    })
    
    return { pause, resume, isActive, interval}
  }

  const createAccessDetails = (totalAvailablePlaces: number) => {

    const baseUrl = getProlificBaseUrl(prolificConfig)
    const url = baseUrl + '/exp?PROLIFIC_PID={{%PROLIFIC_PID%}}&STUDY_ID={{%STUDY_ID%}}&SESSION_ID={{%SESSION_ID%}}'
    return range(totalAvailablePlaces).map(i => ({
      external_url: `${url}&assignment=${i}`,
      total_allocation: 1,
    }))
  }

  function createCompletionCodes(): CompletionCodeSpec[] {
    const codeTypes = [
      {
        code_type: 'COMPLETED',
        actions: [{ action: 'MANUALLY_REVIEW' }]
      },
      {
        code_type: 'ERROR',
        // actions: [{ action: 'REQUEST_RETURN', return_reason: 'Experiment was not completed due to an error.' }]
        actions: [{ action: 'MANUALLY_REVIEW' }]
      },
      {
        code_type: 'ABORTED',
        actions: [{ action: 'REQUEST_RETURN', return_reason: 'Experiment was not completed.' }]
      },
      {
        code_type: 'TIMEOUT',
        actions: [{ action: 'REQUEST_RETURN', return_reason: 'Did not begin study promptly.' }]
      }
    ] as Omit<CompletionCodeSpec, 'code'>[]
    return codeTypes.map(cc => ({
      ...cc,
      code: useCompletionCode(cc.code_type),
    }))
  }

  // Prolific operations
  const createStudy = async (cfg: ProlificConfig & { internal_name: string }): Promise<StudyFull> => {
    const studies = await studiesCache.getListAsync()
    const previousStudyIds = studies.map((s: Study) => s.id)

    const filters = cfg.eligibility 
      ? eligibilityToFilters(cfg.eligibility)
      : [...(cfg.filters || [])]
    const existingBlocklist = filters.find(f => f.filter_id === 'previous_studies_blocklist')

    if (existingBlocklist) {
      const existingValues = existingBlocklist.selected_values || []
      existingBlocklist.selected_values = R.unique([...existingValues, ...previousStudyIds])
    } else if (previousStudyIds.length > 0) {
      filters.push({
        filter_id: 'previous_studies_blocklist',
        selected_values: previousStudyIds
      })
    }

    const payload: StudyPayload = {
      name: cfg.name,
      internal_name: cfg.internal_name,
      description: cfg.description,
      prolific_id_option: 'url_parameters',
      total_available_places: cfg.total_available_places,
      estimated_completion_time: cfg.estimated_completion_time,
      maximum_allowed_time: cfg.maximum_allowed_time,
      reward: cfg.reward,
      currency_code: 'USD',
      device_compatibility: cfg.device_compatibility ?? ['desktop'],
      project: projectId.value,
      filters,
      submissions_config: {
        max_submissions_per_participant: 1,
        max_concurrent_submissions: -1,
        // auto_rejection_categories: ['EXCEPTIONALLY_FAST'],
      },
      access_details: createAccessDetails(cfg.total_available_places),
      completion_codes: createCompletionCodes(),
    }

    const studyResponse = await request<any>('POST', '/studies/', payload)
    const study = await fetchStudy(studyResponse.id)
    studiesCache.updateItem(study)
    return study
  }

  const publishStudy = async (studyId: string): Promise<void> => {
    await request<any>('POST', `/studies/${studyId}/transition/`, {
      action: 'PUBLISH'
    })
    console.log('STUDY PUBLISHED ON PROLIFIC', studyId)
    const updatedStudy = await fetchStudy(studyId)
    studiesCache.updateItem(updatedStudy)
  }

  const deleteStudy = async (studyId: string): Promise<void> => {
    await request('DELETE', `/studies/${studyId}`)
    studiesCache.deleteItem(studyId)
  }

  const pauseStudy = async (studyId: string): Promise<void> => {
    await request<any>('POST', `/studies/${studyId}/transition/`, {
      action: 'PAUSE'
    })
    const updatedStudy = await fetchStudy(studyId)
    studiesCache.updateItem(updatedStudy)
  }

  const stopStudy = async (studyId: string): Promise<void> => {
    await request<any>('POST', `/studies/${studyId}/transition/`, {
      action: 'STOP'
    })
    const updatedStudy = await fetchStudy(studyId)
    studiesCache.updateItem(updatedStudy)
  }

  const startStudy = async (studyId: string): Promise<void> => {
    await request<any>('POST', `/studies/${studyId}/transition/`, {
      action: 'START'
    })
    // TODO: for all of these, we should updateItem, need to implement deep merge there
    const updatedStudy = await fetchStudy(studyId)
    studiesCache.updateItem(updatedStudy)
  }

  const updatePlaces = async (studyId: string, newTotal: number): Promise<void> => {
    // TODO: cut this or support not using accessDetails 
    const study = await studiesCache.getItemAsync(studyId)
    if (study.access_details === null) {
      await request<any>('PATCH', `/studies/${studyId}/`, {
        total_available_places: newTotal
      })
    } else {
      const newAccessDetails = createAccessDetails(newTotal)
      console.debug('updatePlaces: newAccessDetails', newAccessDetails)
      await request<any>('PATCH', `/studies/${studyId}/`, {
        access_details: newAccessDetails
      })
    }

    const updatedStudy = await fetchStudy(studyId)
    studiesCache.updateItem(updatedStudy)
  }

  const addPlaces = async (studyId: string, additionalPlaces: number): Promise<void> => {
    const studyInterface = getStudyCache(studyId)
    const study = studyInterface.item.value
    if (!study) throw new ProlificError('Study not found in cache')
    const currentPlaces = study.total_available_places
    return updatePlaces(studyId, currentPlaces + additionalPlaces)
  }

  const replaceAssignments = async (studyId: string, assignmentIds: number[]): Promise<{ replaced: number }> => {
    const study = await studiesCache.getItemAsync(studyId)
    const oldAccessDetails = assertDefined(study.access_details, 'Study lacks access_details')
    const toIncrement = new Set(assignmentIds)

    // validate assignmentIds
    assert(toIncrement.size === assignmentIds.length, 'Assignment IDs are not unique')
    assert(assignmentIds.length > 0, 'Assignment IDs are empty')
    assert(assignmentIds.every(id => id >= 0 && id < oldAccessDetails.length), 'assignmentIds are out of range')

    let nInc = 0 // extra safety
    const updatedAccessDetails = oldAccessDetails.map((detail, index) => {
      if (toIncrement.has(index)) {
        nInc++
        return { ...detail, total_allocation: detail.total_allocation + 1 }
      }
      return detail
    })
    assert(nInc === assignmentIds.length, 'replaceAssignments is broken')

    await request('PATCH', `/studies/${studyId}/`, {
      access_details: updatedAccessDetails
    })

    const updatedStudy = await fetchStudy(studyId)
    studiesCache.updateItem(updatedStudy)
    return { replaced: assignmentIds.length }
  }

  const approveSubmissions = async (
    studyId: string,
    participantIds?: string[]
  ): Promise<{ approved: number }> => {
    
    const study = await studiesCache.getItemAsync(studyId)

    let toApprove = participantIds
    if (!toApprove) {
      const completionCodes = study.completion_codes
        .filter(c => c.code_type === 'COMPLETED')
        .map(c => c.code)

      toApprove = study.submissions
        .filter(sub =>
          sub.status === 'AWAITING REVIEW' &&
          completionCodes.includes(sub.study_code || 'NO CODE GIVEN')
        )
        .map(sub => sub.id)
    }

    if (toApprove.length === 0) {
      return { approved: 0 }
    }

    await request('POST', '/submissions/bulk-approve/', {
      submission_ids: toApprove
    })

    // refresh study until statuses are updated
    watchStudy(studyId, {
      interval: 2000,
      maxCall: 30,
      callback: (study) => {
        console.log('checking submissions', study.submissions.map(sub => sub.status))
        const allApproved = study.submissions.every(sub => sub.status === 'APPROVED' || !toApprove.includes(sub.id))
        if (allApproved) {
          return true // stop listening
        }
      }
    })

    return { approved: toApprove.length }
  }

  const approveSubmission = async (studyId: string, submissionId: string): Promise<void> => {
    await request('POST', `/submissions/${submissionId}/transition/`, {
      action: 'APPROVE',
    })

    // Refresh study to get updated submission
    await studiesCache.getItemAsync(studyId)
  }

  const requestReturn = async (studyId: string, submissionId: string): Promise<void> => {
    await request('POST', `/submissions/${submissionId}/request-return/`, {
      request_return_reasons: ["Did not complete the study"],
    })
    await studiesCache.getItemAsync(studyId)
  }

  const rejectSubmission = async (studyId: string, submissionId: string): Promise<void> => {
    await request('POST', `/submissions/${submissionId}/transition/`, {
      action: 'REJECT',
      rejection_category: 'NO_DATA',
    })
    await studiesCache.getItemAsync(studyId)
  }

  // NOTE: bonusesInCents is the TOTAL bonus (including already paid), newBonusTotal is only the NEW amount to pay
  const assignBonuses = async ( studyId: string, bonusesInCents: Record<string, number>, newBonusTotal: number ) => {
    
    // we treat this as an error so that the user is notified about a likely mistake
    if (newBonusTotal === 0) {
      throw new ProlificError(`newBonusTotal is 0; cannot assign bonuses`)
    }
    
    const study = await studiesCache.getItemAsync(studyId)
    const submissions = study.submissions

    // convert session ids to participant ids
    const normalizedBonuses = R.mapKeys(bonusesInCents, (id: string) => {
      const session = submissions.find(sub => sub.id === id || sub.participant_id === id)
      if (session) {
        return session.participant_id
      }
      throw new Error(`Invalid session/participant ID: ${id}`)
    })

    // calculate the new bonuses (provided totals minus existing)
    const previousBonus = Object.fromEntries(
      submissions.map(sub => [
        sub.participant_id,
        sum(sub.bonus_payments)
      ])
    )
    const newBonus = R.mapValues(normalizedBonuses, (amount, pid) => {
      const existing = assertDefined(previousBonus[pid], `Missing existing bonus data for participant ${pid}`)
      return amount - existing
    })
    const totalNew = sum(R.values(newBonus))
    if (totalNew !== newBonusTotal) {
      throw new ProlificError(`Bonus total mismatch: expected ${newBonusTotal} got ${totalNew}`)
    }

    // sanity check the bonuses
    for (const [pid, amount] of Object.entries(newBonus)) {
      if (amount < -1) {
        throw new ProlificError(`New bonus for participant ${pid} is negative: ${amount}`)
      }
      if (amount % 1 > 1e-6) {  // allow for floating point precision errors
        throw new ProlificError(`New bonus for participant ${pid} is not an integer: ${amount}`)
      }
      const total = amount + assertDefined(previousBonus[pid])
      if (total > 20_00) {
        throw new ProlificError(`Total bonus for participant ${pid} exceeds $20 limit: ${amount}`)
      }
    }

    // convert to CSV format required by prolific
    const bonusString = Object.entries(newBonus)
      .filter(([_, amount]) => amount > 0)
      .map(([pid, amount]) => `${pid},${round2(amount / 100).toFixed(2)}`)
      .join('\n')

    assert(bonusString.length > 0, 'problem generating bonus CSV')

    // API has two steps: upload, then confirm
    const response = await request<{ total_amount: number; id: string }>(
      'POST',
      '/submissions/bonus-payments/',
      {
        study_id: studyId,
        csv_bonuses: bonusString
      }
    )
    // double check that we're spending the amount we expect
    if (Math.abs(response.total_amount - newBonusTotal * PROLIFIC_FEE) > 5) {
      throw new ProlificError(`Bonus total mismatch: expected ${round(newBonusTotal * PROLIFIC_FEE)} with prolific fee, got ${response.total_amount}`)
    }

    // prevent double-bonusing due to API not updating quickly enough
    const lastBonusTimestamp = useLocalStorage<number>(`prolific_bonuses_timestamp_${studyId}`, 0)
    if (Date.now() - lastBonusTimestamp.value < 10_000) {
      throw new ProlificError(`Recently assigned bonuses for ${studyId}, please wait 10 seconds before assigning again.`)
    }
    lastBonusTimestamp.value = Date.now()    

    // confirm bonus payment
    await request('POST', `/bulk-bonus-payments/${response.id}/pay/`, {})
    // refresh study until bonuses are updated
    // TODO (maybe) we make a lot of unnecessary calls to fetch the study (only need submissions)
    watchStudy(studyId, {
      interval: 2000,
      maxCall: 30,
      callback: (study) => {
        console.log('checking bonuses')
        const allBonused = study.submissions.every(sub => sum(sub.bonus_payments) >= (newBonus[sub.participant_id] ?? 0))
        if (allBonused) {
          return true // stop listening
        }
      }
    })
  }

  const getStudyLink = (studyId: string): string => {
    return `https://app.prolific.com/researcher/workspaces/studies/${studyId}/submissions`
  }

  return {
    token,
    setToken,
    projectId,
    status: readonly(status),
    studyList,
    getStudyCache,
    request,
    createStudy,
    publishStudy,
    deleteStudy,
    pauseStudy,
    stopStudy,
    startStudy,
    updatePlaces,
    addPlaces,
    replaceAssignments,
    approveSubmissions,
    approveSubmission,
    requestReturn,
    rejectSubmission,
    assignBonuses,
    getStudyLink,
  }
})
