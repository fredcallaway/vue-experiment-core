import { DEFAULT_PROLIFIC_CONFIG } from '../prolific'
import type { ProlificConfig } from '../prolific'

const STUDY_DRAFT_PATH = '/studyDraft'

export const useProlificConfig = createGlobalState(() => {
  const { set, onValue } = useDatabase()
  const config = ref<ProlificConfig>(R.clone(DEFAULT_PROLIFIC_CONFIG))
  const isLoading = ref(true)
  const isApplyingRemote = ref(false)

  const saveConfig = useDebounceFn(async () => {
    if (isApplyingRemote.value) return
    await set(STUDY_DRAFT_PATH, toRaw(config.value))
  }, 1000)

  watch(config, () => {
    saveConfig()
  }, { deep: true })

  const unsubscribe = onValue(STUDY_DRAFT_PATH, (snapshot) => {
    isLoading.value = false
    if (!snapshot.exists()) {
      saveConfig()
      return
    }

    const merged = R.mergeDeep(DEFAULT_PROLIFIC_CONFIG, snapshot.val())
    if (R.isDeepEqual(merged, config.value)) return
    isApplyingRemote.value = true
    config.value = merged
    nextTick(() => {
      isApplyingRemote.value = false
    })
  })

  tryOnUnmounted(() => {
    unsubscribe()
  })

  return {
    config,
    isLoading,
    saveConfig,
  }
})
