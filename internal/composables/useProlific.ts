import '~/prolific.config.ts'

const PAGE_SIZE = 5

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
    } else if (result.status === 401) {
      status.value = 'invalidToken'
    } else if (result.status == 404) {
      status.value = 'invalidProjectId'
    } else {
      console.error('Prolific status check failed', result)
    }
  })

  const request = async <T>(method: string, path: string, body?: any): Promise<T> => {
    await Promise.any([
      until(status).toBe('ok'),
      timeoutPromise(2000)
    ])
    if (status.value !== 'ok') {
      throw new ProlificError('invalid status: ' + status.value)
    }
    const response = await baseRequest(method, path, body)

    if (response.status === 204) {
      return {} as T
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
      const msg = `API Error: ${method} ${path}\nStatus: ${response.status}\nResponse: ${JSON.stringify(data, null, 2)}`
      throw new ProlificError(msg)
    }

    return data
  }

  const fetchStudies = async ({page = null as number | null, status = null as string | null}): Promise<StudyShort[]> => {
    let query = '?ordering=-date_created'
    if (page) {
      query += `&page_size=${PAGE_SIZE}&page=${page}`
    }
    if (status) {
      query += `&status=${status}`
    }
    // const query = `&page=${page}&page_size=${PAGE_SIZE}`
    const response = await request<{ results: any[], _links?: { next?: { href?: string } } }>(
      'GET',
      `/projects/${projectId.value}/studies?${query}`
    )
    return response.results.map((s: any) => ProlificStudyShortSchema.parse(s))
  }

  // Async generator for study list
  const fetchStudyList = async function*(): AsyncGenerator<StudyShort[], void, unknown> {
    // 1. First page of -date_created (immediate)
    const firstPage = await fetchStudies({ page: 1 })
    yield firstPage

    // 2. Status queries in parallel
    const statusQueries = [
      fetchStudies({ status: 'AWAITING REVIEW' }),
      fetchStudies({ status: 'ACTIVE' }),
      fetchStudies({ status: 'PAUSED' })
    ]

    for (const promise of statusQueries) {
      const results = await promise
      if (results.length > 0) {
        yield results
      }
    }

    // 3. Remaining -date_created pages
    let page = 2
    const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000

    while (true) {
      const pageStudies = await fetchStudies({ page })

      if (pageStudies.length === 0) break

      yield pageStudies

      // Check if all studies in this page are old
      const allOld = pageStudies.every(s =>
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
    const url = useConfig().url + '/exp?PROLIFIC_PID={{%PROLIFIC_PID%}}&STUDY_ID={{%STUDY_ID%}}&SESSION_ID={{%SESSION_ID%}}'
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
        actions: [{ action: 'REQUEST_RETURN', return_reason: 'Experiment was not completed due to an error.' }]
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
    } else {
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
        auto_rejection_categories: ['EXCEPTIONALLY_FAST'],
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

  const assignBonuses = async ( studyId: string, bonusesInCents: Record<string, number> ) => {
    const study = await studiesCache.getItemAsync(studyId)

    const submissions = study.submissions
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

    // sanity check the bonuses
    for (const [id, amount] of Object.entries(normalizedBonuses)) {
      if (amount < -1) {
        throw new ProlificError(`Bonus amount for ${id} is negative: ${amount}`)
      }
      if (amount % 1 > 1e-6) {  // allow for floating point precision errors
        throw new ProlificError(`Bonus amount for ${id} is not an integer: ${amount}`)
      }
      if (amount > 20_00) {
        throw new ProlificError(`Bonus amount for ${id} exceeds $20 limit: ${amount}`)
      }
    }
    
    const newBonus = R.mapValues(normalizedBonuses, (amount, pid) => amount - previousBonus[pid])

    const bonusString = Object.entries(newBonus)
      .filter(([_, amount]) => amount > 0)
      .map(([pid, amount]) => `${pid},${round2(amount / 100).toFixed(2)}`)
      .join('\n')

    if (!bonusString) {
      return { totalAmount: 0, confirmPayment: async () => {} }
    }

    const response = await request<{ total_amount: number; id: string }>(
      'POST',
      '/submissions/bonus-payments/',
      {
        study_id: studyId,
        csv_bonuses: bonusString
      }
    )

    // return a callback to confirm the payment
    const confirmPayment = async () => {
      await request('POST', `/bulk-bonus-payments/${response.id}/pay/`, {})
      // refresh study until bonuses are updated
      // TODO (maybe) we make a lot of unnecessary calls to fetch the study (only need submissions)
      watchStudy(studyId, {
        interval: 2000,
        maxCall: 30,
        callback: (study) => {
          console.log('checking bonuses', study.submissions.map(sub => sub.bonus_payments))
          const allBonused = study.submissions.every(sub => sum(sub.bonus_payments) >= (newBonus[sub.participant_id] ?? 0))
          if (allBonused) {
            return true // stop listening
          }
        }
      })

    }

    return { totalAmount: response.total_amount, confirmPayment }
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
    approveSubmissions,
    approveSubmission,
    assignBonuses,
    getStudyLink,
  }
})
