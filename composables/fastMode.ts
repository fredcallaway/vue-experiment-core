export const useFastMode = () => {
  const fast = useSessionStorage('fast', false)
  if (getUrlFlag('fast')) {
    fast.value = true
  }
  return fast
}


// reactive version, "mutates" the target ref
export const declareFast = (target: Ref<number>, fastValue: number) => {
  const counterfactualValue = ref(target.value)  // Track what the value would be without fast mode
  let lastObservedValue = target.value
  const fast = useFastMode()

  watchImmediate(fast, (isNowFast) => {
    if (isNowFast) {
      counterfactualValue.value = target.value  // Current value becomes our counterfactual baseline
      target.value = Math.min(target.value, fastValue)
      lastObservedValue = target.value
    } else {
      target.value = counterfactualValue.value
      lastObservedValue = target.value
    }
  })

  // Watch for changes to target and apply same changes to counterfactual
  watch(target, (newVal) => {
    if (fast.value) {
      // Apply the same additive change to our counterfactual value
      const change = newVal - lastObservedValue
      counterfactualValue.value += change
      lastObservedValue = newVal
    } else {
      // Not in fast mode, counterfactual tracks actual value
      counterfactualValue.value = newVal
      lastObservedValue = newVal
    }
  })
}


// non-reactive version
export const replaceFast = (normalValue: number, fastValue: number) => {
  const fast = useFastMode()
  const result = fast.value ? Math.min(fastValue, normalValue) : normalValue
  return result
}