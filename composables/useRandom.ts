import { Random }  from 'random'

export type ResetRandom = Random & {reset: () => void}

interface UseRandomOptions {
  storeState?: boolean
  ignoreSessionId?: boolean
}

export const useRandom = useMemoize((name: string, opt: UseRandomOptions = { storeState: false, ignoreSessionId: false }): ResetRandom => {
  const { sessionId } = useCurrentSession()
  const seed = name + (opt.ignoreSessionId ? '' : (sessionId ?? String(trueRandom())))  // each session gets different randomness
  console.log('useRandom: seed', seed)

  // XOR shift implementation adapted from 
  // https://github.com/transitive-bullshit/random/blob/master/src/generators/xor128.ts
  const initState = {
    x: 0,
    y: 0,
    z: 0,
    w: 0,
  }
  const state = opt.storeState ? useLocalStorage(`useRandom-${seed}`, initState) : ref(initState)

  // console.log('useRandom.state', state.value)

  const next = () => {
    const t = state.value.x ^ (state.value.x << 11)
    state.value.x = state.value.y
    state.value.y = state.value.z
    state.value.z = state.value.w
    state.value.w = state.value.w ^ ((state.value.w >>> 19) ^ t ^ (t >>> 8))
    return (state.value.w >>> 0) / 0x1_00_00_00_00
  }

  const reset = () => {
    // console.log('useRandom.reset', seed)
    state.value.x = 0
    state.value.y = 0
    state.value.z = 0
    state.value.w = 0

    // Mix in string seed, then discard an initial batch of 64 values.
    for (let i = 0; i < seed.length + 64; ++i) {
      state.value.x ^= seed.charCodeAt(i) | 0
      next()
    }
  }
  
  if (R.isDeepEqual(state.value, initState)) {
    reset()
  }

  const rng = new Random(next) as ResetRandom
  rng.reset = reset

  return rng
})
