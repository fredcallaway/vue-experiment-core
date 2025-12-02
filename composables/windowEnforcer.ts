const minWidth = ref(800)
const minHeight = ref(600)

export const defineWindowSize = (options: { width: number; height: number }) => {
  minWidth.value = options.width
  minHeight.value = options.height
}

export const resetWindowSize = () => {
  minWidth.value = 800
  minHeight.value = 600
}

export const useWindowEnforcer = () => {
  const { width: trueWidth, height: trueHeight } = useWindowSize()
  
  const { effectiveScale: zoomScale } = useSizeScale()
  const width = computed(() => round(trueWidth.value / zoomScale.value))
  const height = computed(() => round(trueHeight.value / zoomScale.value))
  
  const violated = computed(() => {
    return width.value < minWidth.value || height.value < minHeight.value
  })
  
  const necessaryScaling = computed(() => {
    const s = 0.8 * Math.min(width.value / minWidth.value, height.value / minHeight.value)
    if (s > 1) return 1
    return s
  })

  return {
    minWidth,
    minHeight,
    width,
    height,
    violated,
    necessaryScaling
  }
}
