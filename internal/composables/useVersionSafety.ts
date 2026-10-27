import { useDatabase } from '../../composables/useDatabase'
import { versionWarnings, type StudyDeployment } from '../deploymentSafety'

export function useVersionSafety(version: () => string, sha: () => string) {
  const studies = ref<Record<string, StudyDeployment> | null>(null)
  const loading = ref(true)
  const error = ref('')
  const warnings = computed(() => versionWarnings(version(), sha(), studies.value))

  const refresh = async () => {
    try {
      const snapshot = await useDatabase().get('studies')
      studies.value = snapshot.val()
      error.value = ''
    } catch (cause) {
      error.value = `Could not check posted experiment versions: ${String(cause)}`
      throw cause
    } finally {
      loading.value = false
    }
  }
  refresh().catch(() => {})

  return { warnings, loading, error, refresh }
}
