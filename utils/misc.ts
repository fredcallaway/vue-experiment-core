
export const hashString = (str: string): number => {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash)
}

export const isTextInputFocused = () => {
  const activeElement = document.activeElement
  return activeElement && (
    activeElement.tagName === 'INPUT' || 
    activeElement.tagName === 'TEXTAREA' ||
    (activeElement as HTMLElement).contentEditable === 'true'
  )
}

export function uniqueId(prefix: string = '') {
  const uid = [
    Date.now().toString(),  // sort by time
    trueRandom().toString(36).substring(2, 9),  // ensure uniqueness
  ].join('-')
  return prefix ? `${prefix}-${uid}` : uid
}

export function string2array(str: string): string[] {
  const sepPriority = ['|', ',', ' ']
  const sep = sepPriority.find(s => str.includes(s))
  return str.split(sep ?? ' ')
}

export function ensureNumber(x: string | number): number {
  const n = Number(x)
  if (isNaN(n)) {
    throw new Error(`Invalid number: ${x}`)
  }
  return n
}

export const timeoutPromise = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

