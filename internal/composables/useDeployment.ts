
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
  const unconfigured = computed(() => {
    return config.contactEmail.includes('@fakeDomain')
  })

  const status = computed<DeploymentStatus>(() => {
    if (unconfigured.value) return 'unconfigured'
    if (isLoading.value) return 'loading'
    if (isDirty.value) return 'dirty'
    if (error.value) return 'error'
    if (deployedSha.value == localSha.value) return 'deployed'
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
  
  const deploy = async () => {
    await checkGitStatus()
    if (isLoading.value || isDirty.value) {
      return false
    }
    isLoading.value = true
    const response = await fetch('/api/prolific/deploy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    })
    isLoading.value = false
    const result = await response.json()
    
    if (!result.success) {
      error.value = result.error
      return false
    }
    error.value = ''
    
    // Store deployed SHA in Firebase
    const info = {
      sha: result.sha,
      deployedAt: Date.now(),
      version: config.version,
    }
    const db = useDatabase()
    await db.set('deployStatus', info)
    await db.set(`deploys/${info.deployedAt}`, info)
    deployedSha.value = result.sha

    return true
  }

  return {
    deploy,
    localSha,
    deployedSha,
    status,
    error,
    gitStatus,
  }
}
