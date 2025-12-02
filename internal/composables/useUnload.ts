export const useUnload = createGlobalState(() => {
  const enabled = ref(true)
  const unloading = ref(false)
  const db = useDataWriter()

  const cancelUnload = () => {
    unloading.value = false
    logEvent('experiment.unload.canceled')
  }

  useEventListener(window, 'beforeunload', (event) => {
    if (!enabled.value) return
    unloading.value = true
    logEvent('experiment.unload.started')
    db.flush()
    event.preventDefault()
    event.returnValue = '' // for legacy browsers
  })

  useEventListener(window, 'unload', () => {
    if (!enabled.value) return
    logEvent('experiment.unload.confirmed')
    db.flush()
  })

  return {
    unloading,
    cancelUnload,
    disable: () => enabled.value = false,
    enable: () => enabled.value = true,
  }
})

