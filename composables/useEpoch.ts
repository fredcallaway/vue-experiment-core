import { logEvent, logDebug } from './logEvent'
import { usePhases } from './usePhases'

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

export type PhaseEpoch<T extends string = string> = Epoch & {
  phase: Readonly<Ref<T>>,
  phases: readonly T[],
  goTo: (phase: T) => Promise<void>,
  Phase: ReturnType<typeof usePhases>['Phase'],
}

// this should never be the currentEpoch
const TOP_EPOCH = {
  _name: '__TOP_EPOCH__',
  id: '__TOP_EPOCH__',
  done: () => {console.warn('TOP_EPOCH.done() called')},
  next: () => console.warn('TOP_EPOCH.next() called'),
  _parent: null as unknown as Epoch,  // typing hack
}

const currentEpoch = ref<Epoch>(TOP_EPOCH)
export const useCurrentEpoch = () => currentEpoch
// I think this is necessary for findEpoch, weird reactivity thing
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

  // Log step changes
  watch(step, (newStep, oldStep) => {
    if (oldStep !== undefined) {
      logEvent(`epoch.step.${newStep}`, { id: E.id, from: oldStep })
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
    if (newStep < 0 || newStep >= E.nSteps) {
      console.warn(`Epoch ${name}: step ${newStep} is out of bounds [0, ${E.nSteps-1}]`)
    }
    step.value = newStep
  }

  return E
}


const isIndexableEpoch = (epoch: Epoch): epoch is IndexableEpoch => {
  return 'step' in epoch && 'nSteps' in epoch && 'prev' in epoch && 'goTo' in epoch
}

export const isPhaseEpoch = (epoch: Epoch): epoch is PhaseEpoch => {
  return 'phase' in epoch && 'phases' in epoch && 'goTo' in epoch && 'Phase' in epoch
}

interface PhaseEpochOptions {
  transition?: 'fade' | 'none'
  transitionDuration?: number
}

export function usePhaseEpoch<const T extends readonly string[]>(
  name: string,
  phases: T,
  options: PhaseEpochOptions = {}
): PhaseEpoch<T[number]> {
  type Phase = T[number]

  const E = useEpoch(name) as PhaseEpoch<Phase>
  const phasesResult = usePhases(phases, options)

  // Log phase changes
  watch(phasesResult.phase, (newPhase, oldPhase) => {
    if (oldPhase !== undefined) {
      logEvent(`epoch.phase.${newPhase}`, { id: E.id, from: oldPhase })
    }
  })

  const nextPhase = async () => {
    const idx = phases.indexOf(phasesResult.phase.value)
    if (idx < phases.length - 1) {
      await phasesResult.goToPhase(phases[idx + 1])
    } else {
      E.done()
    }
  }

  E.next = nextPhase
  E.phase = phasesResult.phase
  E.phases = phases
  E.goTo = phasesResult.goToPhase
  E.Phase = phasesResult.Phase

  return E
}

export const jumpToEpoch = async (epochId: string) => {
  logDebug('jumpToEpoch', epochId)
  await useDataWriter().withDisabled(async () => {
    
    const parts = epochId.split('-')
    // console.log('jumpToEpoch:', JSON.stringify({epochId, parts}))
    
    // Build the target prefix progressively
    let builtPrefix = ''
    let iterationCount = 0
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const bracketMatch = part.match(/^([^[]+)\[(\d+)\]$/)
      const partName = bracketMatch ? bracketMatch[1] : part
      const partStep = bracketMatch ? parseInt(bracketMatch[2]) : null
      
      // Add to our expected prefix
      if (i === 0) {
        builtPrefix = part
      } else {
        builtPrefix += '-' + part
      }
      
      // console.log('processing part:', JSON.stringify({i, part, partName, partStep, builtPrefix}))
      
      // Navigate until we find an epoch that contains this part in its hierarchy
      while (true) {
        if (iterationCount++ > 1000) {
          throw new Error(`jumpToEpoch: iteration limit exceeded`)
        }
        
        await nextTick()
        
        const currentEpochId = currentEpoch.value.id
        // console.log('current:', JSON.stringify({currentEpochId, currentName: currentEpoch.value._name}))
        
        // Check if we've reached or passed the target
        let re: RegExp
        if (builtPrefix.includes('[')) {
          // If builtPrefix contains brackets, match it exactly (with brackets)
          const escapedPrefix = builtPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          re = new RegExp(`(^|-)${escapedPrefix}(-|$)`)
        } else {
          // If no brackets, match as word boundary (allows B to match B[0] but not Baz)
          const escapedPrefix = builtPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          re = new RegExp(`(^|-)\\b${escapedPrefix}\\b(\\[|-|$)`)
        }
        if (re.test(currentEpochId)) {
          break
        }
        
        // Check if we can use goTo on a parent epoch
        let epoch: Epoch = currentEpoch.value
        let useGoTo = false
        
        while (epoch._parent) {
          epoch = epoch._parent
          if (epoch._name === partName && partStep !== null && isIndexableEpoch(epoch)) {
            // console.log('using goTo on parent:', JSON.stringify({name: epoch._name, step: partStep}))
            epoch.goTo(partStep)
            useGoTo = true
            break
          }
        }
        
        if (useGoTo) {
          await nextTick()
          continue
        }
        
        // Otherwise advance normally
        // console.log('advancing')
        if (currentEpoch.value._name === 'EPage') {
          currentEpoch.value.done()
        } else {
          currentEpoch.value.next()
        }
        
        if (currentEpoch.value._name === '__TOP_EPOCH__') {
          // console.log('reached TOP_EPOCH, not found')
          throw new Error(`jumpToEpoch: '${epochId}' not found`)
        }
      }
    }
  })
}