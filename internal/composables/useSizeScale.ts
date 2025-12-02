export const useSizeScale = () => {
  const enabled = ref(true)
  const scale = useLocalStorage('site-scale', 1, { mergeDefaults: true })

  watch(scale, (val) => {
    if (val < 0.5) scale.value = 0.5
    if (val > 2) scale.value = 2
  }, { immediate: true })

  watchEffect(() => {
    if (enabled.value) {
      document.documentElement.style.zoom = String(scale.value)
    } else {
      document.documentElement.style.zoom = ''
    }
  })

  const effectiveScale = computed(() => enabled.value ? scale.value : 1)

  return {
    enabled,
    scale,
    effectiveScale,
    percentage: computed({
      get: () => Math.round(scale.value * 100),
      set: (val) => {
        scale.value = val / 100
      }
    })
  }
}
