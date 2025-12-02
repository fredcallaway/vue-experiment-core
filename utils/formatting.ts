
export function numString(n: number, noun?: string, options: { skipOne?: boolean } = {}) {
  if (n > 10 || n < 0 || n % 1 != 0) {
    return `${n} ${noun}s`
  }
  if (options.skipOne && n == 1) return noun
  let res = [
    "zero",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
  ][n]
  if (noun) {
    if (n != 1) {
      noun += "s"
    }
    res += " " + noun
  }
  return res
}

export function formatCents(cents: number, prefix: string = '$') {
  return `${prefix}${round2(cents / 100).toFixed(2)}`
}

export function formatTime(ms: number) {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
}

export function formatDateTime(val: number | string | Date | null | undefined, defaultValue: string): string
export function formatDateTime(val: number | string | Date): string
export function formatDateTime(val: number | string | Date | null | undefined, defaultValue?: string): string {
  if (!val) {
    return defaultValue ?? 'N/A'  // N/A case will be a type error but probably better to return something
  }
  const date = new Date(val)
  if (isNaN(date.getTime())) return String(val)
  return date.toLocaleString()
}

export function formatDate(val: number | string | Date) {
  const date = new Date(val)
  if (isNaN(date.getTime())) return String(val)
  return date.toLocaleDateString()
}

export const ensureSign = (x:number, zero:string='+') => x > 0 ? `+${x}` : x == 0 ? `${zero}${x}` : `${x}`
