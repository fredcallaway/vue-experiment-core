export const START_TIME = Date.now()

export const mainContentRef = ref<HTMLElement | null>(null)

// intercept Math.random to use global seeded random
export const trueRandom = Math.random
export const random = useRandom('global')
let hasWarned = false
Math.random = () => {
  if (!hasWarned) {
    console.warn('Intercepting Math.random to use the global seeded RNG; use trueRandom() for non-seeded randomness')
    hasWarned = true
  }
  return random.float()
}

// true when jumpToEpoch is running
// as of 2026-02-15, only used to disable animation in useDisplayPhases
export const isJumping = ref(false) 

export { toast } from 'vue-sonner'