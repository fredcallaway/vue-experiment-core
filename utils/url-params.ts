
import type { WritableComputedRef } from 'vue'

export function getUrlParam<T = string>(key: string, converter?: (value: string) => T): T | null {
  const urlParams = new URLSearchParams(window.location.search)
  const value = urlParams.get(key)
  if (value === null) return null
  return converter ? converter(value) : value as unknown as T
}

// Presence means true, per the usual query-string convention: `?noDev`, `?noDev=`, and `?noDev=1`
// are all on. Only an explicit negation turns it off, so `?fast=0` still disables fast mode.
export function getUrlFlag(key: string): boolean {
  return getUrlParam(key, (v) => !['0', 'false', 'no'].includes(v.toLowerCase())) ?? false
}

export function getUrlNumber(key: string): number | null {
  return getUrlParam(key, (v) => Number(v)) ?? null
}

export function getUrlEnum<T extends readonly string[]>(key: string, values: T): T[number] | null {
  return getUrlParam(key, (v) => R.isIncludedIn(v, values) ? v : null)
}

type UrlParamCodec<T> = {
  parse: (value: string) => T
  format: (value: T) => string
}

const stringUrlParamCodec: UrlParamCodec<string> = {
  parse: value => value,
  format: value => value,
}

export function useUrlParam(key: string): WritableComputedRef<string | undefined>
export function useUrlParam<T>(key: string, codec: UrlParamCodec<T>): WritableComputedRef<T | undefined>
export function useUrlParam<T>(key: string, codec?: UrlParamCodec<T>) {
  return useUrlParamWithCodec(key, codec ?? stringUrlParamCodec as unknown as UrlParamCodec<T>)
}

const urlParams = useUrlSearchParams()
const cache = new Map<string, WritableComputedRef<unknown>>()
function useUrlParamWithCodec<T>(key: string, codec: UrlParamCodec<T>): WritableComputedRef<T | undefined> {
  const result = computed({
    get() {
      const raw = urlParams[key]
      if (raw === '' || raw === undefined) return undefined
      const string = assertString(raw, `Multiple values passed for url parameter: ${key}`)
      return codec.parse(string)
    },
    set(newValue) {
      if (newValue === undefined) {
        delete urlParams[key]
      } else {
        urlParams[key] = codec.format(newValue)
      }
    },
  })
  cache.set(key, result)
  return result
}
