import { useConfig } from '../../composables/useConfig'
import { useDatabase } from '../../composables/useDatabase'
import { useIntervalFn } from '@vueuse/core'
import { contactEmailError } from '../deploymentSafety'
import { useVersionSafety } from './useVersionSafety'


export interface GitStatus {
  sha: string
  dirty: boolean
}

type DeploymentStatus = 'ready' | 'loading' | 'dirty' | 'error' | 'deployed' | 'unconfigured'

export const useDeployment = () => {
  const error = ref('')
  const localSha = ref('')
  const deployedSha = ref('')  
  const isLoading = ref(false)
  const isDirty = ref(false)
  const gitStatus = ref('')

  const config = useConfig()
  const unconfigured = computed(() => !!contactEmailError(config.contactEmail))
  const versionSafety = useVersionSafety(() => config.version, () => localSha.value)

  const status = computed<DeploymentStatus>(() => {
    if (unconfigured.value) return 'unconfigured'
    if (isLoading.value || !localSha.value || deployedSha.value === 'loading...') return 'loading'
    if (isDirty.value) return 'dirty'
    if (error.value) return 'error'
    if (deployedSha.value && deployedSha.value === localSha.value) return 'deployed'
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
  }
  checkDeployedSha()
  
  const deploy = async (allowVersionReuse = false) => {
    await checkGitStatus()
    if (isLoading.value || isDirty.value || unconfigured.value) {
      return false
    }
    isLoading.value = true
    try {
      await versionSafety.refresh()
      const result = await $fetch('/api/prolific/deploy', {
        method: 'POST', body: { allowVersionReuse },
      })
      if (!result.success) throw new Error(result.error)
      error.value = ''
      deployedSha.value = result.sha
      return true
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause)
      return false
    } finally {
      isLoading.value = false
    }
  }

  return {
    deploy,
    localSha,
    deployedSha,
    status,
    error,
    gitStatus,
    versionSafety,
  }
}
