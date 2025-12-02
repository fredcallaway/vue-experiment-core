type DataView = (sessionData: SessionData) => object[]

const dataViews = reactive({} as Record<string, DataView>)

export const useDataViews = () => {
  return dataViews
}

export const declareDataView = (name: string, fn: (sessionData: SessionData) => object[]) => {
  dataViews[name] = fn
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