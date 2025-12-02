
export function getUrlParam<T = string>(key: string, converter?: (value: string) => T): T | null {
  const urlParams = new URLSearchParams(window.location.search)
  const value = urlParams.get(key)
  if (value === null) return null
  return converter ? converter(value) : value as unknown as T
}

export function getUrlFlag(key: string): boolean {
  return getUrlParam(key, (v) => ['1', 'true', 'yes'].includes(v)) ?? false
}

export function getUrlNumber(key: string): number | null {
  return getUrlParam(key, (v) => Number(v)) ?? null
}

export function getUrlEnum<T extends readonly string[]>(key: string, values: T): T[number] | null {
  return getUrlParam(key, (v) => R.isIncludedIn(v, values) ? v : null)
}
