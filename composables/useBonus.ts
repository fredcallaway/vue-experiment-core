
export const useBonus = createGlobalState(() => {
  const meta = useCurrentSession()
  
  const store = reactive({
    points: 0,
    centsPerPoint: 1,
    disabled: false,
    hasAddedPoints: false,
    // get pointsPerCent() {
    //   return 1 / config.centsPerPoint
    // },
    get pointValueString() {
      return this.toCentsString(1)
    },
    get pointsPerCent() {
      return Math.round(1 / (this.centsPerPoint))
    },
    get pointsPerDollar() {
      return Math.round(100 / (this.centsPerPoint))
    },
    get pointsString() {
      return numString(this.points, 'point')
    },
    get dollars() {
      return this.toDollars(this.points)
    },
    get centsString() {
      return this.toCentsString(this.points)
    },
    get dollarsString() {
      return this.toDollarsString(this.points)
    },
    get report() {
      return `Your current bonus is $${this.dollars.toFixed(2)}`
    },
    // get scheme() {
    //   return `one cent for every ${numString(config.pointsPerCent, "point", { skipOne: true })}`
    // },
    addPoints(n: number) {
      if (this.disabled) return
      this.hasAddedPoints = true
      this.points += n
    },
    toCents(points: number) {
      return points * this.centsPerPoint
    },
    toDollars(points: number, allowNegative: boolean = false) { 
      const raw = Math.round(points * this.centsPerPoint) / 100
      return allowNegative ? raw : Math.max(0, raw)
    },
    toCentsString(points: number) {
      return numString(this.toCents(points), 'cent')
    },
    toCentsSymbol(points: number) {
      return `${this.toCents(points)}¢`
    },
    toDollarsString(points: number, allowNegative: boolean = false) {
      return `$${this.toDollars(points, allowNegative).toFixed(2)}`
    },
    disableWhileMounted() {
      if (!getCurrentInstance()) {
        throw new Error('disableWhileMounted can only be used in a component')
      }
      onMounted(() => {
        this.disabled = true
      })
      onUnmounted(() => {
        this.disabled = false
      })
    }
  })

  const previousPoints = usePrevious(() => store.points, 0)

  watch(() => store.points, () => {
    const change = store.points - previousPoints.value
    logEvent('bonus.update', { change, total: store.points })
    meta.bonus = store.dollars
  })

  return store
})
