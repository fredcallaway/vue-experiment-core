import { logEvent, logDebug } from './logEvent'

export type Epoch = {
  done: (result?: any) => void,
  next: () => void,
  onDone: (fn: (result?: any) => void) => void
  
  // internal
  _name: string,
  _parent: Epoch,
  children: Epoch[]  // only includes children that have been mounted
  isNoEpoch?: boolean,
  isPseudoLeaf?: boolean,
  isDisabled?: boolean
  hasIdenticalChildren?: boolean,
  id: string,
}


export type MultistepEpoch = Epoch & {
  step: Readonly<Ref<number>>,
  nSteps: number,
}
export const isMultistepEpoch = (epoch: Epoch): epoch is MultistepEpoch => {
  return 'step' in epoch && 'nSteps' in epoch
}

export type IndexableEpoch = Epoch & {
  step: Ref<number>,
  nSteps: number,
  prev: () => void,
  goTo: (step: number) => void,
}
export const isIndexableEpoch = (epoch: Epoch): epoch is IndexableEpoch => {
  return 'goTo' in epoch
}

export type PhaseEpoch<T extends string = string> = IndexableEpoch & {
  phase: ComputedRef<T>,
  phases: readonly T[],
  goTo: (phase: T) => void,
  // the child epoch for the currently-active phase (one per phase entry)
  phaseEpoch: Ref<Epoch | null>,
}
export const isPhaseEpoch = (epoch: Epoch): epoch is PhaseEpoch<any> => {
  return 'phase' in epoch && 'phases' in epoch
}


type EpochProps = {
  name: string,
  parent: Epoch,
  children?: Epoch[],
  id?: string,
  isDisabled?: boolean,
  isNoEpoch?: boolean,
  isPseudoLeaf?: boolean,
  next?: () => void,
}
// Create a new epoch and adds it to the tree.
const makeEpoch = (props: EpochProps): Epoch => {
  // console.log('makeEpoch', props.name, props.parent)
  assert(props.name === '__TOP_EPOCH__' || R.isDefined(props.parent), 
    'epochs must have a parent (except TOP_EPOCH)'
  )
  assert(props.name.length > 0, 'epoch names cannot be empty')

  const doneListeners = new Set<(result?: any) => void>()

  const epoch = {
    _name: props.name,
    _parent: props.parent,
    children: props.children ?? [],
    isNoEpoch: props.isNoEpoch ?? false,
    isPseudoLeaf: props.isPseudoLeaf ?? false,
    isDisabled: props.isDisabled,
    id: props.id ?? makeId(props.name, props.parent),

    done(_result?: any) {
      if (epoch._name == '__TOP_EPOCH__') {
        console.warn('TOP_EPOCH.done() called')
        return
      }
      // NOTE: isDisabled is mutated by useEpoch onUnmounted
      if (epoch.isDisabled) {
        console.log(`ignoring done() on disabled epoch: ${epoch.id}`)
        return
      }
      // NOT disabled -> call listeners
      for (const listener of doneListeners) {
        listener(_result)
      }
      if (epoch.isNoEpoch) return
      // NOT detached from the epoch system -> return control to parent
      setCurrentEpoch(epoch._parent)
      epoch._parent.next()
    },

    next() {
      if (epoch.isNoEpoch || epoch.isDisabled) return

      if (props.next) {
        props.next()
      } else {
        epoch.done()
      }
    },

    onDone(fn: (result?: any) => void) {
      doneListeners.add(fn)
    }
  }

  // register with parent unless we have already (e.g. backward navigation in navigable sequences)
  if (!epoch.isNoEpoch && !epoch.isDisabled && props.parent) {
    if (!props.parent.children.some(e => e.id === epoch.id)) {
      // TODO: children is currently orderd by visitation, not their number
      props.parent.children.push(epoch)
    }
    if (!isMultistepEpoch(props.parent) && props.parent.children.length > 1) {
      console.warn('non-multistep epochs cannot have multiple children', { 
        parent: props.parent.id,
        children: props.parent.children.map(e => e.id),
      })
      // throw new Error('non-multistep epochs cannot have multiple children')
    }
  }

  return epoch
}

// a dummy root node
export const TOP_EPOCH = makeEpoch({
  name: '__TOP_EPOCH__',
  parent: null as unknown as Epoch,  // typing hack; referring to parent of TOP_EPOCH is disallowed
  id: '__TOP_EPOCH__',
  next: () => console.warn('TOP_EPOCH.next() called'),
})

// shallowRef ensures that currentEpoch.value.step is always a ref
const currentEpoch = shallowRef<Epoch>(TOP_EPOCH)
export const useCurrentEpoch = () => currentEpoch

// I think this variable is necessary because a weird reactivity thing
let _currentEpoch = TOP_EPOCH
export const setCurrentEpoch = (epoch: Epoch) => {
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
  console.warn('findEpoch failed on ' + _currentEpoch.id )
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

// Inject the epoch provided by the nearest enclosing epoch component (or TOP_EPOCH).
// Use this from presentational components (e.g. PContinue) that act on their parent epoch.
// A phase epoch is never itself a parent: its provided context resolves to the
// child epoch of its currently-active phase, so epochs mounted inside a <Phase>
// (and affordances like PContinue) attach to that phase's child.
export const injectParentEpoch = (): Epoch => {
  const E = inject<Epoch>('__EPOCH__', TOP_EPOCH)
  if (isPhaseEpoch(E) && E.phaseEpoch.value) return E.phaseEpoch.value
  return E
}

// this is a trick to do string validation with typescript
type NoHyphen<S extends string> =
  S extends `${string}-${string}`
    ? "epoch name cannot contain hyphens (-)"
    : S

// main composable; this should be documented at some point
export function useEpoch<S extends string>(name: NoHyphen<S>): Epoch {
  if (name.includes('-')) {
    throw new Error(`useEpoch: name "${name}" contain hyphens (-)`)
  }
  
  const attrs = useAttrs()  // properties passed to containing component
  const isDisabled = hasFlag(attrs, "disabled")
  const noEpoch = hasFlag(attrs, "no-epoch") || hasFlag(attrs, "noEpoch")
  if (attrs.done) {
    throw new Error('useEpoch: done attribute is no longer supported')
  }

  const parentEpoch = injectParentEpoch()
  if (parentEpoch.isPseudoLeaf) {
    logWarn('useEpoch: parent epoch is a leaf', { parentEpoch: parentEpoch.id })
  }

  const epoch = makeEpoch({
    name,
    parent: parentEpoch,
    isNoEpoch: noEpoch,
    isDisabled: isDisabled,
  })

  onUnmounted(() => {
    // return control to parent on unmount
    // NOTE: unlike done(), this does NOT call parent.next()
    // TODO: is this the right thing to do here? This might only happen from jumps,
    // in which case it's not necessary because jumpToEpoch will set the epoch upon completion.
    epoch.isDisabled = true
    if (currentEpoch.value.id === epoch.id) {
      console.debug(`👉 useEpoch: unmounted ${epoch.id}. Returning control to parent (${parentEpoch.id})`)
      setCurrentEpoch(parentEpoch)
    }
  })

  if (!isDisabled && !noEpoch) {
    provide('__EPOCH__', epoch)
    setCurrentEpoch(epoch)
    logEvent(`epoch.start`, {id: epoch.id})
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

export function useIndexableEpoch(
  name: string,
  nSteps: number,
  stepRef?: Ref<number>,
  options: { autoLeaf?: boolean } = {},
): IndexableEpoch {
  const { autoLeaf = true } = options
  const E = useEpoch(name) as IndexableEpoch
  const step = stepRef ?? ref(0)

  assert(R.isNumber(step.value), `step.value is not a number: ${step.value}`)
  E.nSteps = nSteps
  E.step = step

  // For sequential epochs that don't have explicit child epochs, we create them.
  // Phase epochs opt out (autoLeaf: false): they create real, phase-named child
  // epochs in goTo instead (see usePhaseEpoch).
  // TODO: maybe we should do this at epoch intialization; would be more robust
  const startNewPseudoLeaf = (parent: Epoch, name: string) => {
    const epoch = makeEpoch({
      name,
      parent,
      isPseudoLeaf: true
    })
    setCurrentEpoch(epoch)
    logEvent(`epoch.start`, {id: epoch.id})
    return epoch
  }
  let activeLeaf: Epoch | null = null

  if (autoLeaf) {
    watchImmediate(step, () => {
      if (E.isNoEpoch) return
      const ensureChild = R.once(() => {
        // NOTE: we need the latter condition because sequential epochs don't necessarily
        // become currentEpoch between steps (if calling E.goTo or E.next directly)
        if (_currentEpoch.id === E.id || _currentEpoch.id === activeLeaf?.id) {
          const name = 'leaf_' + String(step.value)
          activeLeaf = startNewPseudoLeaf(E, name)
        } else {
          activeLeaf = null
        }
      })

      if (getCurrentInstance()) {
        onMounted(ensureChild)
      } else {
        console.debug('useIndexableEpoch: not in a component, using nextTick to ensure child')
        // TODO: figure out how this happens. It could result in creating a leaf unnecesarily.
        void nextTick(ensureChild)
      }
    })
  }

  E.next = () => {
    if (step.value < E.nSteps-1) {
      step.value += 1
    } else {
      E.done()
    }
  }

  E.prev = () => step.value -= 1
  
  E.goTo = (newStep: number) => {
    assert(isBetween(newStep, 0, E.nSteps-1), `IndexableEpoch "${name}": goTo(${newStep}) is out of bounds [0, ${E.nSteps-1}]`)
    step.value = newStep
  }

  return E
}

export function usePhaseEpoch<const T extends readonly string[]>(
  name: string,
  phases: T,
): PhaseEpoch<T[number]> {
  type Phase = T[number]

  // autoLeaf: false — phase epochs create their own child epochs (below) rather
  // than relying on the generic auto-leaf mechanism. Each phase gets a real,
  // phase-named child epoch, so phases are logged, navigable, and can themselves
  // be parents of mounted epochs (e.g. an EPage inside a <Phase>).
  const E = useIndexableEpoch(name, phases.length, undefined, { autoLeaf: false }) as unknown as PhaseEpoch<Phase>
  const baseGoTo = E.goTo

  // The currently-active phase child epoch. injectParentEpoch resolves a phase
  // epoch to this child, so epochs/affordances mounted in the active <Phase>
  // attach to the phase's child rather than the phase epoch itself.
  E.phaseEpoch = shallowRef<Epoch | null>(null)

  // Create the child epoch for the current phase, ending the previous one first.
  // We disable (rather than done()) the previous child so ending it does not
  // advance the parent — the phase change itself is the navigation.
  const enterPhaseChild = () => {
    const prev = E.phaseEpoch.value
    if (prev) prev.isDisabled = true
    const child = makeEpoch({ name: E.phase.value, parent: E })
    setCurrentEpoch(child)
    logEvent(`epoch.start`, { id: child.id })
    E.phaseEpoch.value = child
  }

  E.goTo = (arg: Phase | number) => {
    if (typeof arg === 'number') {
      baseGoTo(arg)
    } else {
      const phase = assertOneOf(arg, phases, `PhaseEpoch "${name}": goTo(${arg}) is not a valid phase (${phases.join(', ')})`)
      baseGoTo(phases.indexOf(phase))
    }
    if (!E.isNoEpoch) enterPhaseChild()
  }

  // next/prev advance the step directly in useIndexableEpoch, bypassing goTo;
  // route them through goTo so they also enter the new phase's child epoch.
  E.next = () => {
    if (E.step.value < E.nSteps - 1) E.goTo(E.step.value + 1)
    else E.done()
  }
  E.prev = () => E.goTo(E.step.value - 1)

  // Ending the phase epoch ends its active phase child too.
  const baseDone = E.done
  E.done = (result?: any) => {
    const child = E.phaseEpoch.value
    if (child) {
      child.isDisabled = true
      E.phaseEpoch.value = null
    }
    baseDone(result)
  }

  E.phase = computed(() => phases[E.step.value])
  E.phases = phases

  // Enter the first phase's child epoch (goTo is not called for the initial phase).
  if (!E.isNoEpoch) enterPhaseChild()

  return E
}

export const jumpToEpoch = async (epochId: string, isFallback: boolean = false): Promise<null | string> => {
  logDebug(`jump.start`, { epochId })
  if (epochId === '') return null
  if (isJumping.value) {
    console.warn(`jumpToEpoch(${epochId}): waiting for existing jump to complete`)
    await until(isJumping).toBe(false)
    console.log(`jumpToEpoch(${epochId}): existing jump completed; resuming`)
  }
  if (_currentEpoch.id === epochId) {
    console.log(`jumpToEpoch(${epochId}): already at target epoch`)
    return null
  }
  isJumping.value = true
  const parts = epochId.split('-')
  try {
    const result = await jumpToEpochImpl(parts)
    if (!isFallback) {
      logDebug('jump.success', { epochId }) // sending a signal to EventView
    }
    return result
  } catch (e) {
    logError('error jumping to epoch', e)
    let shortened = epochId.substring(0, epochId.lastIndexOf('-'))
    while (shortened) {
      try {
        return await jumpToEpochImpl(shortened.split('-'))
      } catch (fallbackError) {
        logError('error jumping to fallback epoch', fallbackError)
        shortened = shortened.substring(0, shortened.lastIndexOf('-'))
      }
    }
    return null
  } finally {
    isJumping.value = false
  }
}


const jumpToEpochImpl = async (parts: string[]): Promise<null | string> => {

  let expectedPrefix = ''
  for (let i = 0; i < parts.length; i++) {
    await nextTick()  // maybe unnecessary; should help ensure currentEpoch is up to date
    const part = parts[i]
    if (part.startsWith('leaf_')) {
      continue
    }

    // Extend expected prefix
    if (i === 0) {
      expectedPrefix = part
    } else {
      expectedPrefix += '-' + part
    }

    if (_currentEpoch.id.startsWith(expectedPrefix)) {
      // we already have this part
      continue
    }

    // Parse the part
    const bracketMatch = part.match(/^([^[]+)\[([\d\w]+)\]$/)
    if (!bracketMatch) {
      // Check that the epoch exists in the stack
      assertDefined(findEpoch((e) => e._name === part), `jumpToEpoch: epoch '${part}' not found (no bracket)`)
      // Nothing to do; proceed to next part
      continue
    }
    const partName = bracketMatch[1]
    const partIndex = bracketMatch[2]

    // Find the epoch in the current hierarchy
    const epoch = assertDefined(findEpoch((e) => e._name === partName), `jumpToEpoch: epoch '${partName}' not found (bracket)`)
    assert(isIndexableEpoch(epoch), `jumpToEpoch: epoch '${partName}' is not indexable`)

    // Go to the specified index (non-numeric string for PhaseEpoch)
    await useDataWriter().withDisabled(async () => {
      if (isPhaseEpoch(epoch)) {
        epoch.goTo(partIndex)
      } else {
        epoch.goTo(parseInt(partIndex))
      }
    })

    if (!_currentEpoch.id.startsWith(expectedPrefix)) {
      throw new Error(`jumpToEpoch: ${_currentEpoch.id} does not have expected prefix ${expectedPrefix}`)
    }
  }
  // Confirm that we ended up where we expected
  // const currentPrefix = indexableEpochPrefix(currentEpoch.value.id)
  // assert(currentPrefix.startsWith(expectedPrefix), `expected ${expectedPrefix} but got ${currentPrefix}`)

  return currentEpoch.value.id
}
