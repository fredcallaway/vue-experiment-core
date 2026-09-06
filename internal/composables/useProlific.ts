const PAGE_SIZE = 5
const API_INTERVAL = 1000
const API_CONCURRENCY_LIMIT = 3
const STUDIES_CACHE_KEY_PREFIX = 'prolific_studies'

type ProlificWorkspace = {
  id: string
  title?: string
  name?: string
}

type ProlificProject = {
  id: string
  title: string
  description?: string
  workspace: string
}

export const useProlific = createGlobalState(() => {
  const { config: prolificConfig } = useProlificConfig()
  const projectId = useDatabase().sync('/prolificProjectId', '')
  const token = ref('')
  const studiesCacheKey = `${STUDIES_CACHE_KEY_PREFIX}_${projectId.value}`
  const guaranteedCompleteTime = useLocalStorage<number | null>(
    `asyncListCache:${studiesCacheKey}:guaranteedCompleteTime`,
    null,
  )

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

  const writeToken = async (newToken: string) => {
    try {
      await fetch('/api/prolific/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: newToken })
      })
    } catch (error) {
      throw new ProlificError(`Failed to save token: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

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

  const directRequest = async <T>(method: string, path: string, body?: any): Promise<T> => {
    const response = await baseRequest(method, path, body)
    const responseText = await response.text()
    const data = responseText.trim()
      ? JSON.parse(responseText)
      : {}

    if (!response.ok) {
      throw new ProlificError(
        `API Error: ${method} ${path}\nStatus: ${response.status}\nResponse: ${JSON.stringify(data, null, 2)}`
      )
    }

    return data as T
  }

  const status = ref<('unknown' | 'ok' | 'invalidToken' | 'invalidProjectId')>('unknown')

  const checkStatus = async (token: string, projectId: string) => {
    console.log('checking status', token, projectId)
    if (token.length < 10) {
      status.value = 'invalidToken'
    } else if (projectId.length < 10) {
      status.value = 'invalidProjectId'
    }
    else {
      const result = await baseRequest('GET', `/projects/${projectId}`)
      if (result.ok) {
        status.value = 'ok'
      } else if (result.status === 401) {
        status.value = 'invalidToken'
      } else if (result.status == 404) {
        status.value = 'invalidProjectId'
      } else {
        console.error('Prolific status check failed', result)
        status.value = 'unknown'
      }
    }
    return status.value
  }
  
  const tokenPromise = loadToken()
  
  const debouncedCheckStatus = useDebounceFn(checkStatus, 500)
  const initializeStatus = async () => {
    await tokenPromise
    await until(() => projectId.ready).toBe(true)
    await checkStatus(token.value, projectId.value)
  }
  watch([token, projectId], async ([newToken, newProjectId], [oldToken, oldProjectId]) => {
    if (status.value === 'invalidToken' && oldToken === newToken) return
    if (status.value === 'invalidProjectId' && oldProjectId === newProjectId) return
    if (status.value === 'unknown') {
      await tokenPromise
      await until(() => projectId.ready).toBe(true)
      await checkStatus(newToken, newProjectId)
    } else if (status.value === 'ok') {
      await checkStatus(newToken, newProjectId)
    } else {
      await debouncedCheckStatus(newToken, newProjectId)
    }
  })
  initializeStatus()
  
  watchDebounced(token, (newToken) => {
    writeToken(newToken)
  }, { debounce: 500, maxWait: 2000 })

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
        timeoutPromise(5000)
      ])
      if (status.value !== 'ok') {
        throw new ProlificError('processRequest: invalidstatus: ' + status.value)
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

  const listWorkspaces = async (): Promise<ProlificWorkspace[]> => {
    const response = await directRequest<{ results: ProlificWorkspace[] }>('GET', '/workspaces/')
    return response.results
  }

  const listProjects = async (workspaceId: string): Promise<ProlificProject[]> => {
    const response = await directRequest<{ results: ProlificProject[] }>('GET', `/workspaces/${workspaceId}/projects/`)
    return response.results
  }

  const createProject = async (
    workspaceId: string,
    project: { title: string }
  ): Promise<ProlificProject> => {
    return await directRequest<ProlificProject>('POST', `/workspaces/${workspaceId}/projects/`, project)
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

  const getStudyDate = (study: StudyShort) => new Date(study.date_created).getTime()

  const isBeforeGuaranteedCompleteTime = (study: StudyShort, time: number | null) => {
    return time !== null && getStudyDate(study) < time
  }

  const pageStartsBeforeGuaranteedCompleteTime = (studies: StudyShort[], time: number | null) => {
    return studies.length > 0 && isBeforeGuaranteedCompleteTime(studies[0], time)
  }

  const pageEndsBeforeGuaranteedCompleteTime = (studies: StudyShort[], time: number | null) => {
    return studies.length > 0 && isBeforeGuaranteedCompleteTime(studies.at(-1)!, time)
  }

  // Async generator for study list
  const fetchStudyList = async function*(): AsyncGenerator<StudyShort[], void, unknown> {
    const syncStartedAt = Date.now()
    const previousGuaranteedCompleteTime = guaranteedCompleteTime.value

    const firstPageResponse = await fetchStudies({ page: 1 })
    yield firstPageResponse.results

    const maxPage = Math.ceil(firstPageResponse.meta.count / PAGE_SIZE)

    if (!pageStartsBeforeGuaranteedCompleteTime(firstPageResponse.results, previousGuaranteedCompleteTime)) {
      let page = 2
      let reachedGuaranteedCompleteTime = pageEndsBeforeGuaranteedCompleteTime(
        firstPageResponse.results,
        previousGuaranteedCompleteTime,
      )

      while (page <= maxPage && !reachedGuaranteedCompleteTime) {
        const pageResponse = await fetchStudies({ page })

        if (pageResponse.results.length === 0) break

        yield pageResponse.results
        reachedGuaranteedCompleteTime = pageEndsBeforeGuaranteedCompleteTime(
          pageResponse.results,
          previousGuaranteedCompleteTime,
        )
        page++
      }
    }

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

    guaranteedCompleteTime.value = syncStartedAt
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
    storageKey: studiesCacheKey,
    fetchList: fetchStudyList,
    fetchItem: fetchStudy,
    getItemId: (study) => study.id,
    minRefreshInterval: 60_000,  // 60s
  })

  watch(projectId, (newProjectId, oldProjectId) => {
    if (newProjectId === oldProjectId) return
    studiesCache.clear()
    guaranteedCompleteTime.value = null
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
    console.log('watchStudy', studyId)
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

  const createAccessDetails = (length: number, start: number = 0) => {
    if (length < 0) throw new ProlificError('Invalid access_details range')
    const baseUrl = getProlificBaseUrl(prolificConfig.value)
    const url = baseUrl + '/exp?PROLIFIC_PID={{%PROLIFIC_PID%}}&STUDY_ID={{%STUDY_ID%}}&SESSION_ID={{%SESSION_ID%}}'
    return range(length).map(i => ({
      external_url: `${url}&assignment=${i + start}`,
      total_allocation: 1,
    }))
  }

  const addSelectedValuesFilter = (filters: Filter[], filterId: string, values: string[]) => {
    const selectedValues = R.unique(values)
    if (selectedValues.length === 0) return

    const existingFilter = filters.find(f => f.filter_id === filterId)
    if (existingFilter) {
      existingFilter.selected_values = R.unique([...(existingFilter.selected_values || []), ...selectedValues])
    } else {
      filters.push({
        filter_id: filterId,
        selected_values: selectedValues
      })
    }
  }

  const fetchDatabaseParticipantIds = async (): Promise<string[]> => {
    const snapshot = await useDatabase().get('live/meta')
    const metas = snapshot.val() as Record<string, SessionMeta> | null
    if (!metas) return []

    return R.unique(Object.values(metas)
      .map(meta => meta.participantId)
      .filter((participantId): participantId is string => isProlificIdentifier(participantId)))
  }

  const fetchCustomBlocklistFilterId = async (): Promise<string> => {
    type ProlificFilterInfo = {
      filter_id: string
      title?: string
      data_type?: string
    }

    try {
      const response = await request<{ results: ProlificFilterInfo[] }>('GET', '/filters/?filter_tag=custom-group')
      const blocklistFilter = response.results.find(filter => {
        const label = `${filter.filter_id} ${filter.title ?? ''}`.toLowerCase()
        return filter.data_type === 'ParticipantID' && (label.includes('blocklist') || label.includes('blacklist'))
      })
      if (blocklistFilter) return blocklistFilter.filter_id
    } catch (error) {
      console.warn('Could not resolve Prolific custom blocklist filter id; using default.', error)
    }

    return 'custom_blocklist'
  }

  // Prolific operations
  const createStudy = async (cfg: ProlificConfig & { internal_name: string }): Promise<StudyFull> => {
    const filters = cfg.eligibility 
      ? eligibilityToFilters(cfg.eligibility)
      : [...(cfg.filters || [])]

    if (cfg.exclusions?.previousStudies) {
      const studies = await studiesCache.getListAsync()
      const previousStudyIds = studies.map((s: Study) => s.id)
      addSelectedValuesFilter(filters, 'previous_studies_blocklist', previousStudyIds)
    }

    if (cfg.exclusions?.databaseParticipants) {
      const participantIds = await fetchDatabaseParticipantIds()
      if (participantIds.length > 0) {
        const blocklistFilterId = await fetchCustomBlocklistFilterId()
        addSelectedValuesFilter(filters, blocklistFilterId, participantIds)
      }
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
      const accessDetails = assertDefined(study.access_details, 'Study lacks access_details')
      const currentTotal = sum(accessDetails.map(detail => detail.total_allocation))
      if (newTotal < currentTotal) {
        throw new ProlificError(`newTotal (${newTotal}) cannot be less than current total_allocation (${currentTotal})`)
      }
      if (newTotal === currentTotal) {
        return
      }
      const extraCount = newTotal - currentTotal
      const extraDetails = createAccessDetails(extraCount, accessDetails.length)
      const newAccessDetails = [...accessDetails, ...extraDetails]
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

  const replaceAssignments = async (
    studyId: string,
    assignmentCounts: Record<number, number>
  ): Promise<{ replaced: number }> => {
    const study = await studiesCache.getItemAsync(studyId)
    const oldAccessDetails = assertDefined(study.access_details, 'Study lacks access_details')
    const assignments = Object.entries(assignmentCounts).map(([key, count]) => ({
      id: Number(key),
      count
    }))

    assert(assignments.length > 0, 'Assignment counts are empty')
    assert(
      assignments.every(({ id, count }) => Number.isInteger(id) && Number.isInteger(count) && count > 0),
      'Assignment counts must be positive integers'
    )
    assert(assignments.every(({ id }) => id >= 0 && id < oldAccessDetails.length), 'assignmentIds are out of range')

    const replaced = R.sum(assignments.map(a => a.count))
    let applied = 0
    const updatedAccessDetails = oldAccessDetails.map((detail, index) => {
      const increment = assignmentCounts[index] ?? 0
      if (increment === 0) return detail
      applied += increment
      return { ...detail, total_allocation: detail.total_allocation + increment }
    })
    assert(applied === replaced, 'replaceAssignments is broken')

    await request('PATCH', `/studies/${studyId}/`, {
      access_details: updatedAccessDetails
    })

    const updatedStudy = await fetchStudy(studyId)
    studiesCache.updateItem(updatedStudy)
    return { replaced }
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
      interval: 5000,
      maxCall: 30,
      callback: (study) => {
        console.log('checking submissions')
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
      message: `
        Your submission has been rejected because you did not complete the study.
        Send us a message if you would like to return the study instead (we will
        remove the rejection).
      `.trim()
    })
    await studiesCache.getItemAsync(studyId)
  }

  type ParticipantBonusRecord = {
    assignedTime?: number,
    assignedCents?: number,
    confirmedCents?: number,
    confirmedTime?: number,
  }
  type BonusStore = Record<string, ParticipantBonusRecord>
  const useBonusStore = (studyId: string) => {
    const store = useLocalStorage<BonusStore>(`useProlific.bonus.${studyId}`, {})  // reactive object
    const studyCache = getStudyCache(studyId)
    watchImmediate(studyCache.fullItem, (study) => {
      if (study) {
        store.value = R.mergeDeep(store.value, R.pullObject(study.submissions, R.prop("participant_id"), sub => ({
          confirmedCents: sum(sub.bonus_payments),
          confirmedTime: Date.now(),
        })))
        // TODO MAYBE: check for unconfirmed bonuses and warn (toast.warn)
      }
    })
    return store
  }


  // NOTE: bonusesInCents is the TOTAL bonus (including already paid), newBonusTotal is only the NEW amount to pay
  const assignBonuses = async ( studyId: string, bonusesInCents: Record<string, number>, newBonusTotal: number ) => {
    
    // we treat this as an error so that the user is notified about a likely mistake
    if (newBonusTotal === 0) {
      throw new ProlificError(`newBonusTotal is 0; cannot assign bonuses`)
    }
    
    // Note: getItemAsync will reactively update the bonus store
    const study = await studiesCache.getItemAsync(studyId)
    const submissions = study.submissions

    // calculate the new bonuses (provided totals minus existing)
    const previousBonus = Object.fromEntries(
      submissions.map(sub => [
        sub.participant_id,
        sum(sub.bonus_payments)
      ])
    )

    // convert session ids to participant ids
    const normalizedBonuses = R.mapKeys(bonusesInCents, (id: string) => {
      const session = submissions.find(sub => sub.id === id || sub.participant_id === id)
      if (session) {
        return session.participant_id
      }
      throw new Error(`Invalid session/participant ID: ${id}`)
    })

    // calculate the new bonuses (provided totals minus existing)
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
    
    // prevent double-bonusing the same participant due to API not updating quickly enough
    const bonusStore = useBonusStore(studyId)
    const recentlyBonused = Object.keys(newBonus).filter(pid => {
      // the participant is going to get more money AND we tried to send them money recently
      return newBonus[pid] > 0 && Date.now() - (bonusStore.value[pid]?.assignedTime ?? 0) < 10_000
    })
    if (recentlyBonused.length > 0) {
      throw new ProlificError(`Recently assigned bonuses for participants: ${recentlyBonused.join(', ')}. Please wait 10 seconds before assigning again.`)
    }

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

    // confirm bonus payment
    await request('POST', `/bulk-bonus-payments/${response.id}/pay/`, {})

    // record assigned bonuses in store
    const assignTime = Date.now()
    bonusStore.value = R.mergeDeep(bonusStore.value, R.mapValues(normalizedBonuses, (amount) => ({
      assignedTime: assignTime,
      assignedCents: amount,
    })))
   
    // refresh study until bonuses are updated
    // TODO MAYBE we make a lot of unnecessary calls to fetch the study (only need submissions)
    watchStudy(studyId, {
      interval: 5000,
      maxCall: 30,
      callback: (study) => {
        console.log(`checking bonuses for ${studyId}`)
        const currentBonuses = R.pullObject(study.submissions, R.prop("participant_id"), sub => sum(sub.bonus_payments))
        const allBonused = Object.keys(normalizedBonuses).every(pid => currentBonuses[pid] >= normalizedBonuses[pid])
        if (allBonused) {
          console.log(`all bonuses confirmed for ${studyId}`)
          return true // stop listening
        }
      }
    })
  }

  const getStudyLink = (studyId: string): string => {
    return `https://app.prolific.com/researcher/workspaces/studies/${studyId}/submissions`
  }

  const PENDING_COMPLETE_MS = 2 * 60 * 1000
  const pendingCompleteIds = ref<Record<string, true>>({})
  const pendingCompleteTimers: Record<string, ReturnType<typeof setTimeout>> = {}
  const pendingCompleteStops: Record<string, () => void> = {}

  const clearPendingComplete = (studyId: string) => {
    const timer = pendingCompleteTimers[studyId]
    if (timer) {
      clearTimeout(timer)
      delete pendingCompleteTimers[studyId]
    }
    pendingCompleteStops[studyId]?.()
    delete pendingCompleteStops[studyId]
    if (!pendingCompleteIds.value[studyId]) return
    const { [studyId]: _ignored, ...rest } = pendingCompleteIds.value
    pendingCompleteIds.value = rest
  }

  const markPendingComplete = (studyId: string) => {
    clearPendingComplete(studyId)
    pendingCompleteIds.value = { ...pendingCompleteIds.value, [studyId]: true }
    pendingCompleteTimers[studyId] = setTimeout(() => clearPendingComplete(studyId), PENDING_COMPLETE_MS)
    const studyCache = getStudyCache(studyId)
    pendingCompleteStops[studyId] = watch(
      () => studyCache.fullItem.value?.status,
      (status) => {
        if (status === 'COMPLETED') clearPendingComplete(studyId)
      },
    )
  }

  const displayStudyStatus = (study: { id: string, status: string }) => {
    if (pendingCompleteIds.value[study.id] && study.status === 'AWAITING REVIEW') return 'PENDING'
    return study.status
  }

  return {
    token,
    projectId,
    status: readonly(status),
    studyList,
    listWorkspaces,
    listProjects,
    createProject,
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
    useBonusStore,
    markPendingComplete,
    clearPendingComplete,
    displayStudyStatus,
  }
})
