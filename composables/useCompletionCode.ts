export type CompletionCodeType = 'COMPLETED' | 'ERROR' | 'ABORTED' | 'TIMEOUT'

const hashString = (str: string): number => {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash)
}

export const useCompletionCode = (codeType: CompletionCodeType) => {
  const config = useConfig()
  // const cfgCode = config.prolific?.completionCodes?.[codeType]
  // if (cfgCode) {
  //   return cfgCode
  // }

  const input = `${codeType}-${config.version}`
  const hash = hashString(input)

  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let code = codeType[0] + '0' // deterministic part for easy identification
  let remaining = hash
  
  for (let i = 0; i < 5; i++) {
    code += chars[remaining % chars.length]
    remaining = Math.floor(remaining / chars.length)
  }
  
  return code
}
