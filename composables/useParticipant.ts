export const PARTICIPANT_KEYS = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
  'ENTER', 'ESCAPE', 'SPACE', 'BACKSPACE',
  'UP', 'DOWN', 'LEFT', 'RIGHT',
  'NONE',  // an impossible-to-press key - disables the listener
] as const

export type Key = typeof PARTICIPANT_KEYS[number]
export type KeyPress = {key: Key, rt: number}
export type KeySpec = 
 | Key
 | Key[]
 | 'ANY'

export const validateKeySpec = (spec?: string | string[]): KeySpec => {
  if (spec === undefined) return 'ANY'
  if (typeof spec === 'string') {
    if (spec.includes(' ')) {
      spec = spec.split(' ')
    } else {
      spec = [spec]
    }
  }
  spec.forEach(s => assert(KEY_SET.has(s as Key), `invalid key: ${s}`))
  return spec as KeySpec
}

type KeyPressOptions = {
  dedupe?: boolean
  once?: boolean
  preventDefault?: boolean
}
type Unsubscriber = () => void

// TypeMap is a generic mapping of event names to payload types.
// This enables type-safe emit/on/promise methods, ensuring that for each event name,
// the associated payload type is enforced by TypeScript.
type Participant<TypeMap extends Record<string, any> = Record<string, any>> = {
  emit<E extends keyof TypeMap>(eventType: E, info: TypeMap[E]): void
  on<E extends keyof TypeMap>(eventType: E, handler: (info: TypeMap[E]) => void): Unsubscriber
  promise<E extends keyof TypeMap>(eventType: E, predicate: (info: TypeMap[E]) => boolean): Promise<TypeMap[E]>
  onKeyPress(spec: KeySpec, handler: (keyPress: KeyPress) => void, options?: KeyPressOptions): Unsubscriber
  promiseKeyPress(spec: KeySpec): Promise<KeyPress>
}

export const useParticipantBus = () => useEventBus<PEvent>(`participant`)

export function useParticipant<
  TypeMap extends Record<string, any> = Record<string, any>
>(name?: string): Participant<TypeMap> {
  
  const { registerAsync } = useLocalAsync()
  
  const bus = useParticipantBus()

  // unique identifier for each useParticipant value
  // should allow for later playback
  name = useCurrentEpoch().value.id + ' P'
  const idx = useNamedCounter(name).inc()
  const myPid = `${name}-${idx}`
  onUnmounted(() => {
    useNamedCounter(name).dec()
  })

  // Event bus methods
  const emit = <E extends keyof TypeMap>(eventType: E, info: TypeMap[E]) => {
    const event = logEvent(`participant.${String(eventType)}`, {pid: myPid, info}) as PEvent
    bus.emit(event)
  }

  const on = <E extends keyof TypeMap>(eventType: E, listener: (info: TypeMap[E]) => void) => {
    const fullEventType = `participant.${String(eventType)}`
    return bus.on((event: PEvent) => {
      if (event.eventType === fullEventType && event.data.pid === myPid) {
        listener(event.data.info)
      }
    })
  }

  const promise = registerAsync(<E extends keyof TypeMap>(eventType: E, predicate: ((info: TypeMap[E]) => boolean) = () => true) => {
    const { resolve, promise } = Promise.withResolvers<TypeMap[E]>()
    const unsubscribe = on(eventType, (info) => {
      if (predicate(info)) {
        unsubscribe()
        resolve(info)
      }
    })
    return promise
  })

  // a special handler registration function that also creates the underlying key listener
  const onKeyPress = (
    spec: KeySpec,
    handler: (keyPress: KeyPress) => void,
    {dedupe = true,  preventDefault = true} = {}
  ) => {
    const startTime = performance.now()
    
    const keyFilter = makeKeyFilter(spec)

    const unsubBus = on('keyPress', (keyPress: KeyPress) => {
      if (keyFilter(keyPress)) {
        handler(keyPress)
      }
    })

    // convert raw keyboard events to KeyPress events on the bus
    const unsubKeyStroke = onKeyStroke(keyFilter, (event) => {
      if (isTextInputFocused()) return
      
      if (preventDefault) event.preventDefault()
      
      const rt = Math.round(performance.now() - startTime)
      const key = string2key(event.key)
      if (key === null) {
        throw new Error(`key is null in onKeyStroke handler: string2key likely has a bug`)
      }
      emit('keyPress', {key, rt} as TypeMap['keyPress'])

    }, { dedupe })
    
    return () => {
      unsubBus()
      unsubKeyStroke()
    }
  }

  const promiseKeyPress = registerAsync((spec: KeySpec) => new Promise<KeyPress>((resolve) => {
    const unsub = onKeyPress(spec, (keyPress) => {
      resolve(keyPress)
      unsub()
    })
  }))

  return {
    emit,
    on,
    promise,
    onKeyPress,
    promiseKeyPress,
  }
}

const KEY_SET = new Set(PARTICIPANT_KEYS)
const string2key = (s: string): Key | null => {
  const keyMap = {
    ' ': 'SPACE',
    'ArrowUp': 'UP',
    'ArrowDown': 'DOWN',
    'ArrowLeft': 'LEFT',
    'ArrowRight': 'RIGHT',
  }
  if (s in keyMap) {
    return keyMap[s as keyof typeof keyMap] as Key
  }
  const key = s.toUpperCase() as Key
  if (KEY_SET.has(key)) {
    return key
  } else {
    return null
  }
}

const makeKeyFilter = (spec: KeySpec) => {
  return (event: {key: string}) => {
    const key = string2key(event.key)
    if (key === null) return false
    return spec === 'ANY' || spec === key || (R.isArray(spec) && spec.includes(key))
  }
}