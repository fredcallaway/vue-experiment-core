import { logEvent, logDebug } from './logEvent'

export type Epoch = {
  done: (result?: any) => void,
  next: () => void,
  
  // internal
  _name: string,
  _parent: Epoch,
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

const currentEpochIndex = ref<string | undefined>(undefined)
export const useCurrentEpochIndex = () => currentEpochIndex

// I think this variable is necessary because a weird reactivity thing
let _currentEpoch = TOP_EPOCH
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
    return `${parent.id}[${parent.phase.value}]-${name}`
  } else if ('step' in parent) {
    return `${parent.id}[${parent.step.value}]-${name}`
  } else {
    return `${parent.id}-${name}`
  }
}

const hasFlag = (attrs: Record<string, any>, flag: string) => attrs[flag] === "" || attrs[flag] === true

// TODO: doc
export function useEpoch(name: string): Epoch {
  const attrs = useAttrs()  // properties passed to containing component
  let disabled = hasFlag(attrs, "disabled")
  const noEpoch = hasFlag(attrs, "no-epoch") || hasFlag(attrs, "noEpoch")
  
  const parentEpoch = inject<Epoch>('__EPOCH__', TOP_EPOCH)
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
    currentEpoch.value = parentEpoch
    _currentEpoch = parentEpoch

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
  }
  
  onUnmounted(() => {
    disabled = true
    if (currentEpoch.value.id === epoch.id) {
      currentEpoch.value = parentEpoch
    }
  })

  if (!disabled && !noEpoch) {
    provide('__EPOCH__', epoch)
    currentEpoch.value = epoch
    _currentEpoch = epoch
    logEvent(`epoch.start.${name}`, {id})

  }

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

  // Log step changes and update currentEpochIndex
  watchImmediate(step, (newStep, oldStep) => {
    if (isPhaseEpoch(E)) {
      const newPhase = E.phase.value
      logEvent(`epoch.phase.${newPhase}`, { id: E.id })
      currentEpochIndex.value = E.id + '[' + newPhase + ']'
    } else {
      if (oldStep !== undefined) {
        logEvent(`epoch.step.${newStep}`, { id: E.id })
      }
      currentEpochIndex.value = E.id + '[' + newStep + ']'
    }
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

const indexableEpochPrefix = (epochId: string) => {
  // strips everything after the last ]
  const lastBracketIndex = epochId.lastIndexOf(']')
  return epochId.substring(0, lastBracketIndex + 1)
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
      throw new Error(`jumpToEpoch: part '${part}' does not match expected format 'name[index]'`)
    }
    const partName = bracketMatch[1]
    const partIndex = bracketMatch[2]

    // Find the epoch in the current hierarchy
    const epoch = assertDefined(findEpoch((e) => e._name === partName))
    assert(isIndexableEpoch(epoch))

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

  const prefix = indexableEpochPrefix(epochId)
  if (prefix === '') {
    // No indexable prefix, nothing to do
    return null
  }
  
  const parts = prefix.split('-')
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