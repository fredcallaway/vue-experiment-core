import { onKeyStroke } from '@vueuse/core'

import { assert } from './asserts'
import { isTextInputFocused } from './misc'

export const KEYS = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
  'ENTER', 'ESCAPE', 'SPACE', 'BACKSPACE',
  'UP', 'DOWN', 'LEFT', 'RIGHT',
  'NONE',
] as const

export type Key = typeof KEYS[number]
export type KeyPress = { key: Key, rt: number }
export type KeySpec = Key | Key[] | 'ANY'

type KeyPressOptions = {
  dedupe?: boolean
  preventDefault?: boolean
}

const KEY_SET = new Set(KEYS)

const validateKeySpec = (spec?: string | string[]): KeySpec => {
  if (spec === undefined) return 'ANY'
  if (typeof spec === 'string') {
    spec = spec.includes(' ') ? spec.split(' ') : [spec]
  }
  spec.forEach(s => assert(KEY_SET.has(s as Key), `invalid key: ${s}`))
  return spec as KeySpec
}

const string2key = (s: string): Key | null => {
  const keyMap = {
    ' ': 'SPACE',
    ArrowUp: 'UP',
    ArrowDown: 'DOWN',
    ArrowLeft: 'LEFT',
    ArrowRight: 'RIGHT',
  } as const
  if (s in keyMap) {
    return keyMap[s as keyof typeof keyMap]
  }
  const key = s.toUpperCase() as Key
  return KEY_SET.has(key) ? key : null
}

const makeKeyFilter = (spec: KeySpec) => {
  return (event: { key: string }) => {
    const key = string2key(event.key)
    if (key === null) return false
    return spec === 'ANY' || spec === key || (Array.isArray(spec) && spec.includes(key))
  }
}

export const onKeyPress = (
  spec: string | string[] | KeySpec | undefined,
  handler: (keyPress: KeyPress) => void,
  { dedupe = true, preventDefault = true }: KeyPressOptions = {}
) => {
  const normalizedSpec = validateKeySpec(spec)
  const startTime = performance.now()
  const keyFilter = makeKeyFilter(normalizedSpec)

  return onKeyStroke(keyFilter, (event) => {
    if (isTextInputFocused()) return
    if (preventDefault) event.preventDefault()

    const key = string2key(event.key)
    if (key === null) {
      throw new Error('key is null in onKeyStroke handler: string2key likely has a bug')
    }

    handler({
      key,
      rt: Math.round(performance.now() - startTime),
    })
  }, { dedupe })
}

function promiseKeyPressImpl(spec: string | string[] | KeySpec | undefined, maxTime?: number) {
  const { resolve, promise } = Promise.withResolvers<KeyPress | 'TIMEOUT'>()
  const unsubscribe = onKeyPress(spec, (keyPress) => {
    resolve(keyPress)
    unsubscribe()
  })

  if (maxTime !== undefined) {
    setTimeout(() => {
      resolve('TIMEOUT')
      unsubscribe()
    }, maxTime)
  }

  return promise
}

export const promiseKeyPress = promiseKeyPressImpl as {
  (spec?: string | string[] | KeySpec): Promise<KeyPress>
  (spec: string | string[] | KeySpec | undefined, maxTime: number): Promise<KeyPress | 'TIMEOUT'>
}
