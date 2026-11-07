import { useConfig } from '../../composables/useConfig'
import { useDatabase } from '../../composables/useDatabase'
import { useIntervalFn } from '@vueuse/core'
import { contactEmailError, type ActiveProlificStudy } from '../deploymentSafety'
import { useVersionSafety } from './useVersionSafety'
import { datasetVersionError } from '../deploymentIdentity'


export interface GitStatus {
  sha: string
  dirty: boolean
}

type DeploymentStatus = 'ready' | 'loading' | 'dirty' | 'error' | 'deployed' | 'unconfigured'

export const useDeployment = () => {
  const error = ref('')
  const localSha = ref('')
  const deployedSha = ref('')  
  const deployedVersion = ref('')
  const deployedId = ref('')
  const version = useDatabase().sync('deploymentVersion', '')
  const versionError = computed(() => datasetVersionError(version.value))
  const isLoading = ref(false)
  const isDirty = ref(false)
  const gitStatus = ref('')
  const activeStudies = ref<ActiveProlificStudy[] | null>(null)
  const activeStudiesError = ref('')

  const refreshActiveStudies = async () => {
    try {
      const response = await fetch('/api/prolific/active-studies')
      if (!response.ok) throw new Error('Active study check failed')
      activeStudies.value = await response.json()
      activeStudiesError.value = ''
    } catch {
      activeStudies.value = null
      activeStudiesError.value = 'Could not check active studies. Check the Prolific token, project selection, and connection.'
    }
  }
  refreshActiveStudies()
  useIntervalFn(refreshActiveStudies, 30_000)

  const config = useConfig()
  const unconfigured = computed(() => !!contactEmailError(config.contactEmail))
  const versionSafety = useVersionSafety(() => version.value, () => localSha.value)

  const status = computed<DeploymentStatus>(() => {
    if (unconfigured.value) return 'unconfigured'
    if (isLoading.value || !version.ready || !localSha.value || deployedSha.value === 'loading...') return 'loading'
    if (isDirty.value) return 'dirty'
    if (error.value) return 'error'
    if (deployedSha.value && deployedSha.value === localSha.value && deployedVersion.value === version.value) return 'deployed'
    return 'ready'
  })


  const checkGitStatus = async () => {
    try {
      const { sha, dirty, gitStatusOutput } = await $fetch('/api/prolific/git-status', {
        timeout: 1000
      })
      localSha.value = sha
      isDirty.value = dirty
      gitStatus.value = gitStatusOutput
    } catch {
      console.warn('checkGitStatus timed out')
    }
  }
  checkGitStatus()
  useIntervalFn(checkGitStatus, 3000)

  const checkDeployedSha = async () => {
    deployedSha.value = 'loading...'
    const db = useDatabase()
    const snapshot = await db.get('deployStatus')
    const data = snapshot.val()
    deployedSha.value = data?.sha || ''
    deployedVersion.value = data?.version || ''
    deployedId.value = data?.id || ''
  }
  checkDeployedSha()
  watch(() => version.ready && deployedSha.value !== 'loading...', ready => {
    if (ready && !version.value && deployedVersion.value) version.value = deployedVersion.value
  }, { once: true })
  
  const deploy = async (allowVersionReuse = false, allowLiveStudies: string[] = []) => {
    await checkGitStatus()
    if (isLoading.value || isDirty.value || unconfigured.value || versionError.value) {
      return false
    }
    isLoading.value = true
    try {
      await versionSafety.refresh()
      const selectedVersion = version.value
      await version.syncImmediate()
      const result = await $fetch('/api/prolific/deploy', {
        method: 'POST', body: { version: selectedVersion, allowVersionReuse, allowLiveStudies },
      })
      if (!result.success) throw new Error(result.error)
      error.value = ''
      deployedSha.value = result.sha
      deployedVersion.value = result.version
      deployedId.value = result.id
      return true
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause)
      void refreshActiveStudies()
      return false
    } finally {
      isLoading.value = false
    }
  }

  return {
    deploy,
    localSha,
    deployedSha,
    deployedVersion,
    deployedId,
    version,
    versionError,
    status,
    error,
    gitStatus,
    versionSafety,
    refreshDeployment: checkDeployedSha,
    activeStudies,
    activeStudiesError,
    refreshActiveStudies,
  }
}
