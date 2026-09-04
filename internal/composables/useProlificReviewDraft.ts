export type ProlificReviewAction = 'approve' | 'return' | 'reject' | 'none'

export const getProlificReviewDraftPath = (studyId: string) => `studies/${studyId}/reviewDraft`

export const useProlificReviewDraft = (studyId: string) => {
  const database = useDatabase()
  const path = getProlificReviewDraftPath(studyId)
  const actionOverrides = ref<Record<string, ProlificReviewAction>>({})
  const bonusOverrides = ref<Record<string, number>>({})
  const isLoading = ref(true)

  const unsubscribe = database.onValue(path, (snapshot) => {
    const draft = snapshot.val() ?? {}
    actionOverrides.value = draft.actionOverrides ?? {}
    bonusOverrides.value = draft.bonusOverrides ?? {}
    isLoading.value = false
  })

  tryOnUnmounted(unsubscribe)

  const setActionOverride = (submissionId: string, action: ProlificReviewAction | null) => {
    return database.update(path, { [`actionOverrides/${submissionId}`]: action })
  }

  const setBonusOverride = (participantId: string, bonus: number | null) => {
    return database.update(path, { [`bonusOverrides/${participantId}`]: bonus })
  }

  const setBonusOverrides = (bonuses: Record<string, number>) => {
    const updates = Object.fromEntries(
      Object.entries(bonuses).map(([participantId, bonus]) => [`bonusOverrides/${participantId}`, bonus]),
    )
    return database.update(path, updates)
  }

  return {
    actionOverrides,
    bonusOverrides,
    isLoading,
    setActionOverride,
    setBonusOverride,
    setBonusOverrides,
  }
}
