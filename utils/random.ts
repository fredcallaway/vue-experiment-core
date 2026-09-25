import { useRandom } from '../composables/useRandom'
export { trueRandom } from './trueRandom'

// The global seeded RNG. Lives in its own module (not internal/state.ts) so that internal/state.ts
// stays dependency-free: creating `random` eagerly pulls in useRandom -> useCurrentSession,
// which imports from internal/state.ts, forming a module-eval cycle if defined there.

export const random = useRandom('global')
