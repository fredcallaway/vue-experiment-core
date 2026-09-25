import { useDatabase } from '../../composables/useDatabase'
import { createGlobalState } from '@vueuse/core'

export type ProlificReviewAction = 'approve' | 'return' | 'reject' | 'none'

export const getProlificReviewDraftPath = (studyId: string) => `studies/${studyId}/reviewDraft`

const useProlificReviewDraftStore = createGlobalState(() => {
  const database = useDatabase()
  const states = new Map<string, {
    actionOverrides: Ref<Record<string, ProlificReviewAction>>
    bonusOverrides: Ref<Record<string, number>>
    isLoading: Ref<boolean>
  }>()

  const getState = (studyId: string) => {
    const existing = states.get(studyId)
    if (existing) return existing

    const state = {
      actionOverrides: ref<Record<string, ProlificReviewAction>>({}),
      bonusOverrides: ref<Record<string, number>>({}),
      isLoading: ref(true),
    }
    states.set(studyId, state)

    database.onValue(getProlificReviewDraftPath(studyId), (snapshot) => {
      const draft = snapshot.val() ?? {}
      state.actionOverrides.value = draft.actionOverrides ?? {}
      state.bonusOverrides.value = draft.bonusOverrides ?? {}
      state.isLoading.value = false
    })

    return state
  }

  return { database, getState }
})

export const useProlificReviewDraft = (studyId: string) => {
  const { database, getState } = useProlificReviewDraftStore()
  const { actionOverrides, bonusOverrides, isLoading } = getState(studyId)
  const path = getProlificReviewDraftPath(studyId)

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
