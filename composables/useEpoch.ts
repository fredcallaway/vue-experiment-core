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

let _currentEopch = TOP_EPOCH

export const findEpoch = (predicate: (E: Epoch) => boolean): Epoch | null => {
  let epoch = _currentEopch
  while (epoch._name !== '__TOP_EPOCH__') {
    if (predicate(epoch)) {
      return epoch
    }
    epoch = epoch._parent
  }
  return null
}

const makeId = (name: string, parent: Epoch | MultistepEpoch) => {
  if (parent._name == '__TOP_EPOCH__') {
    return name
  } else if ('step' in parent) {
    return `${parent.id}[${parent.step.value}]-${name}`
  } else {
    return `${parent.id}-${name}`
  }
}

// TODO: doc
export function useEpoch(name: string): Epoch {
  const attrs = useAttrs()  // properties passed to containing component
  let disabled = attrs.disabled == "" || attrs.disabled == true

  const parentEpoch = inject<Epoch>('__EPOCH__', TOP_EPOCH)
  const id = makeId(name, parentEpoch)

  const done = R.once((_result?: any) => {
    if (disabled) return
    currentEpoch.value = parentEpoch
    _currentEopch = parentEpoch

    if (R.isFunction(attrs.done)) {
      // @ts-ignore
      attrs.done(done)
      return
    } else if ('done' in attrs) {
      console.warn('attrs.done is not a function', attrs.done)
    }
    // logEvent('epoch.done')
    parentEpoch.next()
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

  if (!disabled) {
    provide('__EPOCH__', epoch)
    currentEpoch.value = epoch
    _currentEopch = epoch
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
  
  E.next = () => {
    if (step.value < E.nSteps-1) {
      step.value += 1
    } else {
      E.done()
    }
  }

  E.prev = () => step.value -= 1
  
  E.goTo = (step: number) => {
    if (step < 0 || step >= E.nSteps) {
      console.warn(`Epoch ${name}: step ${step} is out of bounds [0, ${E.nSteps-1}]`)
    }
    E.step.value = step
  }

  return E
}


const isIndexableEpoch = (epoch: Epoch): epoch is IndexableEpoch => {
  return 'step' in epoch && 'nSteps' in epoch && 'prev' in epoch && 'goTo' in epoch
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