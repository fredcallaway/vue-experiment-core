
function assertNumeric(x: unknown): asserts x is number {
  if (typeof x !== 'number' || isNaN(x)) {
    throw new Error(`Expected a finite number, got ${JSON.stringify(x)}`)
  }
}

export function sum(xs: number[]) {
  xs.forEach(assertNumeric)
  return xs.reduce((acc, x) => acc + x, 0)
}

export function mean(xs: number[]) {
  if (xs.length === 0) throw new Error('mean of empty array')
  return sum(xs) / xs.length
}

export function round(x: number, n: number = 0) {
  assertNumeric(x)
  assertNumeric(n)
  if (n == 0) return Math.round(x)
  return Math.round(x * 10 ** n) / 10 ** n
}
export const round1 = (x: number) => round(x, 1)
export const round2 = (x: number) => round(x, 2)
export const round3 = (x: number) => round(x, 3)

export const max = (...args: number[]) => {
  args.forEach(assertNumeric)
  return Math.max(...args)
}
export const min = (...args: number[]) => {
  args.forEach(assertNumeric)
  return Math.min(...args)
}
export const abs = (x: number) => {
  assertNumeric(x)
  return Math.abs(x)
}
export const clamp = (x: number, lo: number, hi: number) => {
  assertNumeric(x)
  assertNumeric(lo)
  assertNumeric(hi)
  return max(lo, min(hi, x))
}
export const cumsum = (xs: number[]) => {
  xs.forEach(assertNumeric)
  return R.mapWithFeedback(xs, (prev, x) => prev + x, 0)
}

export function std(xs: number[]) {
  if (xs.length === 0) throw new Error('std of empty array')
  const mx = mean(xs)
  return Math.sqrt(xs.reduce((acc, x) => acc + (x - mx) ** 2, 0) / xs.length)
}

export function isBetween(x: number, min: number, max: number) {
  assertNumeric(x)
  assertNumeric(min)
  assertNumeric(max)
  return x >= min && x <= max
}