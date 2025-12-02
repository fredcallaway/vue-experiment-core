import { ref } from 'vue'
import { ref as dbRef, get, set } from 'firebase/database'

export interface GitStatus {
  sha: string
  dirty: boolean
}

type DeploymentStatus = 'ready' | 'loading' | 'dirty' | 'error' | 'deployed'

export const useDeployment = () => {
  const error = ref('')
  const localSha = ref('')
  const deployedSha = ref('')  
  const isLoading = ref(false)
  const isDirty = ref(false)
  const gitStatus = ref('')

  const status = computed<DeploymentStatus>(() => {
    if (isLoading.value) return 'loading'
    if (isDirty.value) return 'dirty'
    if (error.value) return 'error'
    if (deployedSha.value == localSha.value) return 'deployed'
    return 'ready'
  })

  const checkGitStatus = async () => {
    const response = await fetch('/api/prolific/git-status')
    const { sha, dirty, gitStatusOutput } = await response.json()
    localSha.value = sha
    isDirty.value = dirty
    gitStatus.value = gitStatusOutput
  }
  checkGitStatus()
  useIntervalFn(checkGitStatus, 3000)

  const checkDeployedSha = async () => {
    deployedSha.value = 'loading...'
    const db = useDatabase()
    const snapshot = await get(dbRef(db, 'deployStatus'))
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
    const db = useDatabase()
    await set(dbRef(db, 'deployStatus'), {
      sha: result.sha,
      deployedAt: Date.now(),
    })
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
