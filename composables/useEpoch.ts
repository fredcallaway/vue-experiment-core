import { logEvent, logDebug } from './logEvent'

export type Epoch = {
  done: (result?: any) => void,
  next: () => void,
  
  // internal
  _name: string,
  _parent: Epoch,
  isNoEpoch?: boolean,
  isLeaf?: boolean,
  id: string,
}

export type MultistepEpoch = Epoch & {
  step: Readonly<Ref<number>>,
  nSteps: number,
}

export type IndexableEpoch = Epoch & {
  step: Ref<number>,
  nSteps: number,
  prev: () => void,
  goTo: (step: number) => void,
}

export type PhaseEpoch<T extends string = string> = IndexableEpoch & {
  phase: ComputedRef<T>,
  phases: readonly T[],
  goTo: (phase: T) => void,
}

const isIndexableEpoch = (epoch: Epoch): epoch is IndexableEpoch => {
  return 'step' in epoch && 'goTo' in epoch
}

export const isPhaseEpoch = (epoch: Epoch): epoch is PhaseEpoch => {
  return 'phase' in epoch
}

// this should never be the currentEpoch
const TOP_EPOCH = {
  _name: '__TOP_EPOCH__',
  id: '__TOP_EPOCH__',
  done: () => {console.warn('TOP_EPOCH.done() called')},
  next: () => console.warn('TOP_EPOCH.next() called'),
  _parent: null as unknown as Epoch,  // typing hack
}

// WARNING: currentEpoch.step is not a ref
const currentEpoch = ref<Epoch>(TOP_EPOCH)
export const useCurrentEpoch = () => currentEpoch

// I think this variable is necessary because a weird reactivity thing
let _currentEpoch = TOP_EPOCH
const setCurrentEpoch = (epoch: Epoch) => {
  _currentEpoch = epoch
  currentEpoch.value = epoch
}

export const findEpoch = (predicate: (E: Epoch) => boolean): Epoch | null => {
  let epoch = _currentEpoch
  while (epoch._name !== '__TOP_EPOCH__') {
    if (predicate(epoch)) {
      return epoch
    }
    epoch = epoch._parent
  }
  return null
}

const makeId = (name: string, parent: Epoch | MultistepEpoch | PhaseEpoch) => {
  if (parent._name == '__TOP_EPOCH__') {
    return name
  } else if ('phase' in parent && 'phases' in parent) {
    const phase = assertDefined(parent.phase.value, 'phase is undefined')
    return `${parent.id}[${phase}]-${name}`
  } else if ('step' in parent) {
    const step = assertDefined(parent.step.value, 'step is undefined')
    return `${parent.id}[${step}]-${name}`
  } else {
    return `${parent.id}-${name}`
  }
}

const hasFlag = (attrs: Record<string, any>, flag: string) => attrs[flag] === "" || attrs[flag] === true


type NoHyphen<S extends string> =
  S extends `${string}-${string}`
    ? "epoch name cannot contain hyphens (-)"
    : S

export function useEpoch<S extends string>(name: NoHyphen<S>): Epoch {
  if (name.includes('-')) {
    throw new Error(`useEpoch: name "${name}" contain hyphens (-)`)
  }
  
  const attrs = useAttrs()  // properties passed to containing component
  let disabled = hasFlag(attrs, "disabled")
  const noEpoch = hasFlag(attrs, "no-epoch") || hasFlag(attrs, "noEpoch")
  
  const parentEpoch = inject<Epoch>('__EPOCH__', TOP_EPOCH)
  if (parentEpoch.isLeaf) {
    logDebug('⚠️ useEpoch: parent epoch is a leaf', { parentEpoch: parentEpoch.id })
    console.warn('⚠️ useEpoch: parent epoch is a leaf', { parentEpoch: parentEpoch.id })
  }
  const id = makeId(name, parentEpoch)


  if (attrs.done) {
    assert(R.isFunction(attrs.done), 'attrs.done is not a function')
  }

  const done = R.once((_result?: any) => {
    if (disabled) return
    if (noEpoch) {
      // @ts-ignore
      if (attrs.done) attrs.done()
      return
    }
    // normal epoch behavior
    setCurrentEpoch(parentEpoch)

    if (attrs.done) {
      // @ts-ignore
      attrs.done(done)
    } else {
      // logEvent('epoch.done')
      parentEpoch.next()
    }
  })

  const epoch: Epoch = {
    _name: name,
    id,
    _parent: parentEpoch,
    done,
    next: done, // is overriden by multistep epochs
    isNoEpoch: noEpoch,
  }
  
  onUnmounted(() => {
    disabled = true
    if (currentEpoch.value.id === epoch.id) {
      setCurrentEpoch(parentEpoch)
    }
  })

  if (!disabled && !noEpoch) {
    provide('__EPOCH__', epoch)
    setCurrentEpoch(epoch)
    logEvent(`epoch.start`, {id})
  }

  return epoch
}

function makeLeafEpoch(parentEpoch: Epoch, name: string): Epoch {
  
  const id = makeId(name, parentEpoch).replace('-leaf', '')

  const done = R.once((_result?: any) => {
    setCurrentEpoch(parentEpoch)
    parentEpoch.next()
  })

  const epoch: Epoch = {
    _name: name,
    id,
    _parent: parentEpoch,
    done,
    next: done,
    isLeaf: true,
  }
  
  onUnmounted(() => {
    // disabled = true
    logDebug('unmounting leaf', { E: epoch.id })
    return
  })

  setCurrentEpoch(epoch)
  provide('__EPOCH__', epoch)
  logEvent(`epoch.start`, {id})


  return epoch
}

export function useMultistepEpoch(name: string, nSteps: number, stepRef?: Ref<number>): MultistepEpoch {
  const E = useEpoch(name) as MultistepEpoch
  const step = stepRef ?? ref(0)
  assert(R.isNumber(step.value), `step.value is not a number: ${step.value}`)


  E.nSteps = nSteps
  E.step = readonly(step)

  E.next = () => {
    if (step.value < nSteps) {
      step.value += 1
    } else {
      E.done()
    }
  }

  return E
}

export function useIndexableEpoch(name: string, nSteps: number, stepRef?: Ref<number>): IndexableEpoch {
  const E = useEpoch(name) as IndexableEpoch
  const step = stepRef ?? ref(0)

  assert(R.isNumber(step.value), `step.value is not a number: ${step.value}`)
  E.nSteps = nSteps
  E.step = step

  let _activeLeaf: Epoch | null = null

  watchImmediate(step, (newStep, oldStep) => {
    if (E.isNoEpoch) {
      return
    }
    // Create a leaf epoch if necessary
    const ensureChild = R.once(() => {
      if (_currentEpoch.id === E.id || _activeLeaf) {
        // logDebug('making leaf', { E: E.id })
        _activeLeaf = makeLeafEpoch(E, 'leaf')
      } else {
        // logDebug('has child', { E: E.id, child: _currentEpoch.id })
        _activeLeaf = null
      }
    })
    // onMounted is sooner (better), nextTick is backup
    onMounted(ensureChild)
    nextTick(ensureChild)
  })
  
  E.next = () => {
    if (step.value < E.nSteps-1) {
      step.value += 1
    } else {
      E.done()
    }
  }

  E.prev = () => step.value -= 1
  
  E.goTo = (newStep: number) => {
    assert(isBetween(newStep, 0, E.nSteps-1),  `IndexableEpoch "${name}": goTo(${newStep}) is out of bounds [0, ${E.nSteps-1}]`)
    step.value = newStep
  }

  return E
}

// watchEffect(() => {
//   logDebug('currentEpoch', { currentEpoch: currentEpoch.value.id })
// })


export function usePhaseEpoch<const T extends readonly string[]>(
  name: string,
  phases: T,
): PhaseEpoch<T[number]> {
  type Phase = T[number]

  const E = useIndexableEpoch(name, phases.length) as unknown as PhaseEpoch<Phase>
  const baseGoTo = E.goTo

  E.goTo = (arg: Phase | number) => {
    if (typeof arg === 'number') {
      baseGoTo(arg)
      return
    }
    const phase = assertOneOf(arg, phases, `PhaseEpoch "${name}": goTo(${arg}) is not a valid phase (${phases.join(', ')})`)
    const step = phases.indexOf(phase)
    baseGoTo(step)
  }
  
  E.phase = computed(() => phases[E.step.value])
  E.phases = phases

  return E
}

const jumpToEpochImpl = async (parts: string[]): Promise<null | string> => {

  let expectedPrefix = ''
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]

    // Extend expected prefix
    if (i === 0) {
      expectedPrefix = part
    } else {
      expectedPrefix += '-' + part
    }

    // Parse the part
    const bracketMatch = part.match(/^([^[]+)\[([\d\w]+)\]$/)
    if (!bracketMatch) {
      // Check that the epoch exists in the stack
      assertDefined(findEpoch((e) => e._name === part), `jumpToEpoch: epoch '${part}' not found`)
      // Nothing to do; proceed to next part
      continue
    }
    const partName = bracketMatch[1]
    const partIndex = bracketMatch[2]

    // Find the epoch in the current hierarchy
    const epoch = assertDefined(findEpoch((e) => e._name === partName), `jumpToEpoch: epoch '${partName}' not found`)
    assert(isIndexableEpoch(epoch), `jumpToEpoch: epoch '${partName}' is not indexable`)

    // Go to the specified index (non-numeric string for PhaseEpoch)
    await useDataWriter().withDisabled(async () => {
      if (isPhaseEpoch(epoch)) {
        epoch.goTo(partIndex)
      } else {
        epoch.goTo(parseInt(partIndex))
      }
    })

    await nextTick()
  }
  
  // Confirm that we ended up where we expected
  // const currentPrefix = indexableEpochPrefix(currentEpoch.value.id)
  // assert(currentPrefix.startsWith(expectedPrefix), `expected ${expectedPrefix} but got ${currentPrefix}`)

  return expectedPrefix
}


export const jumpToEpoch = async (epochId: string): Promise<null | string> => {
  logDebug(`jumpToEpoch: ${epochId}`)
  if (epochId === '') return null
  
  const parts = epochId.split('-')
  try {
    return await jumpToEpochImpl(parts)
  } catch (e) {
    logError('error jumping to epoch', e)
    const shortened = epochId.substring(0, epochId.lastIndexOf('-'))
    if (shortened != epochId) {
      return await jumpToEpoch(shortened)
    }
    return null
  }
}