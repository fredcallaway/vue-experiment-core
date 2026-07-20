// The global seeded RNG. Lives in its own module (not globals.ts) so that globals.ts
// stays dependency-free: creating `random` eagerly pulls in useRandom -> useCurrentSession,
// which imports from globals.ts, forming a module-eval cycle if defined there.

export const trueRandom = Math.random
export const random = useRandom('global')

let hasWarned = false
// intercept Math.random to use global seeded random
Math.random = () => {
  if (!hasWarned) {
    console.warn('Intercepting Math.random to use the global seeded RNG; use trueRandom() for non-seeded randomness')
    hasWarned = true
  }
  return random.float()
}
