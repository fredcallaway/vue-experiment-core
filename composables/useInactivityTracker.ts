export const IDLE_TIME = 10 * 1000

export const useInactivityTracker = createGlobalState(() => {

  const { idle } = useIdle(IDLE_TIME)
  const focused = useWindowFocus()
  const unfocused = computed(() => !focused.value)
  const inactive = computed(() => idle.value || unfocused.value)

  let inactiveTime = 0
  const inactiveStart = ref<number | null>(null)

  const getCurrentInactiveTime = () => {
    if (!inactiveStart.value) return 0
    return Date.now() - inactiveStart.value
  }

  const getTotalInactiveTime = () => {
    return inactiveTime + getCurrentInactiveTime()
  }

  watchImmediate(inactive, (val) => {
    if (val && !inactiveStart.value) {
      // NOTE: we only count idle time after IDLE_TIME ms has passed
      inactiveStart.value = Date.now()
    } else if (!val && inactiveStart.value) {
      inactiveTime += Date.now() - inactiveStart.value
      inactiveStart.value = null
    }
  })

  return { inactive, unfocused, idle, inactiveStart, getTotalInactiveTime, getCurrentInactiveTime }
})
