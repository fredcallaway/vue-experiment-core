export const getUnoColor = (name: string, fmt: 'oklch' | 'hex' = 'hex'): string => {
  const oklch = getComputedStyle(document.documentElement)
    .getPropertyValue(`--colors-${name}`)
    .trim();
  
  switch (fmt) {
    case 'oklch': return oklch
    case 'hex': return oklchToHex(oklch)
    default: throw new Error(`Invalid format: ${fmt}`)
  }
}

const oklchToHex = (oklch: string): string => {
  // Strip oklch(...) wrapper and parse values
  const match = oklch.match(/oklch\(([^)]+)\)/)
  if (!match) throw new Error(`Invalid oklch format: ${oklch}`)
  
  const parts = match[1].trim().split(/\s+/)
  if (parts.length !== 3) throw new Error(`Invalid oklch: ${oklch}`)
  
  // Parse lightness (may have % suffix)
  const lStr = parts[0]
  const l = lStr.endsWith('%') 
    ? Number(lStr.slice(0, -1)) / 100 
    : Number(lStr)
  
  const c = Number(parts[1])
  const h = Number(parts[2])
  
  if ([l, c, h].some(isNaN)) throw new Error(`Invalid oklch: ${oklch}`)

  const a = c * Math.cos(h * Math.PI / 180)
  const b = c * Math.sin(h * Math.PI / 180)
  // oklab to linear rgb
  const L = l
  const A = a
  const B = b
  const l_ = L + 0.3963377774 * A + 0.2158037573 * B
  const m_ = L - 0.1055613458 * A - 0.0638541728 * B
  const s_ = L - 0.0894841775 * A - 1.2914855480 * B

  const l3 = l_ ** 3
  const m3 = m_ ** 3
  const s3 = s_ ** 3

  let r =  +4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3
  let g =  -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3
  let b_ =  -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3

  r = Math.max(0, Math.min(1, r))
  g = Math.max(0, Math.min(1, g))
  b_ = Math.max(0, Math.min(1, b_))

  const toHex = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b_)}`
}

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

export function stripUndefined<T extends Record<string, any>>(obj: T) {
  return R.pickBy(obj, R.isDefined) as Partial<T>
}

export type NumberLike = number | `${number}`

export function ensureNumber(x: NumberLike | undefined, defaultValue: number): number;
export function ensureNumber(x: NumberLike): number;
export function ensureNumber(x: NumberLike | undefined, defaultValue?: number): number {
  if (R.isDefined(defaultValue) && !R.isDefined(x)) {
    return defaultValue
  }
  const n = Number(x)
  if (isNaN(n)) {
    throw new Error(`Invalid number: ${x}`)
  }
  return n
}

export const timeoutPromise = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
