import { useCurrentSession } from './useCurrentSession'

type HeartbeatMessage = {
  type: 'heartbeat'
  tabId: string
  sessionId: string
}

const HEARTBEAT_INTERVAL = 1000
const TAB_TIMEOUT = 1100

export const useMultipleTabDetection = () => {
  const meta = useCurrentSession()
  const isOnly = ref(true)
  const isPrimary = ref(true)
  const liveTabs = reactive<Map<string, number>>(new Map())
  
  const tabId = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
  const bc = new BroadcastChannel('multitab789')
  
  const updatePrimaryStatus = () => {
    for (const [id, lastSeen] of liveTabs.entries()) {
      if (Date.now() - lastSeen > TAB_TIMEOUT) {
        liveTabs.delete(id)
      }
    }
    const activeTabs = Array.from(liveTabs.keys())
    activeTabs.push(tabId)
    activeTabs.sort()
    
    isOnly.value = activeTabs.length === 1
    isPrimary.value = activeTabs[0] === tabId
  }
  
  // Send heartbeat periodically
  const heartbeat = useIntervalFn(() => {
    bc.postMessage({ type: 'heartbeat', tabId, sessionId: meta.sessionId } as HeartbeatMessage)
    updatePrimaryStatus()
  }, HEARTBEAT_INTERVAL, { immediate: true })

  const logMismatch = useThrottleFn((msg: HeartbeatMessage) => {
    logEvent('experiment.multipleTab.sessionMismatch', { ours: meta.sessionId, theirs: msg.sessionId })
  }, 600_000)

  // Listen for messages from other tabs
  bc.onmessage = (event) => {
    if (event.data && event.data.type == 'heartbeat') {
      const msg = event.data as HeartbeatMessage
      
      liveTabs.set(msg.tabId, Date.now())
      updatePrimaryStatus()

      if (msg.sessionId !== meta.sessionId) {
        logMismatch(msg)
      }
    }
  }
  
  // Cleanup on unmount
  tryOnUnmounted(() => {
    heartbeat.pause()
    bc.close()
  })
  
  return { isOnly, isPrimary, liveTabs, tabId }
}

