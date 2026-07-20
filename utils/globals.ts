export const START_TIME = Date.now()

export const mainContentRef = ref<HTMLElement | null>(null)

// The global seeded RNG (`random`, `trueRandom`) lives in utils/random.ts to keep
// globals.ts free of module-eval dependencies.

// true when jumpToEpoch is running
// as of 2026-02-15, only used to disable animation in useDisplayPhases
export const isJumping = ref(false) 

export { toast } from 'vue-sonner'