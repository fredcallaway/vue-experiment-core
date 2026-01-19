
export type CsvDataView = {
  format: 'csv'
  fn: (sessionData: SessionData) => Record<string, any>[]
}
export type JsonDataView = {
  format: 'json'
  fn: (sessionData: SessionData) => SafeData // JSON-friendly, see data.ts
}
type DataView = CsvDataView | JsonDataView

const dataViews = reactive({} as Record<string, DataView>)

export const useDataViews = () => {
  return dataViews
}

export const declareDataView = (name: string, fn: (sessionData: SessionData) => object[]) => {
  dataViews[name] = {format: 'csv', fn}
  return fn
}

export const declareDataViewJson  = (name: string, fn: (sessionData: SessionData) => SafeData) => {
  dataViews[name] = {format: 'json', fn}
  return fn
}

export type ParseError = {
  error: string
  info: any
  _isParseError: true
}

export const parseError = (message: string, info: any) => {
  return {
    error: message,
    info,
    _isParseError: true,
  }
}