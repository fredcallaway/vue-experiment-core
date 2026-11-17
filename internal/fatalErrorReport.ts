type ReportContext = {
  path?: string
  deployment?: string
}

// Error reporting must not depend on experiment initialization or traverse arbitrary application data.
function read(value: unknown, key: string): unknown {
  try {
    return value !== null && (typeof value === 'object' || typeof value === 'function')
      ? (value as Record<string, unknown>)[key] : undefined
  } catch {
    return undefined
  }
}

function text(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : ''
}

function clean(value: string): string {
  return value.slice(0, 12_000)
    .replace(/\b(?:https?|wss?):\/\/[^\s<>"')]+/gi, raw => {
      try {
        const url = new URL(raw)
        const position = url.search || url.hash ? raw.match(/:\d+(?::\d+)?$/)?.[0] ?? '' : ''
        return `${url.origin}${url.pathname}${position}`
      } catch {
        return '[unavailable URL]'
      }
    })
    .replace(/\bBearer\s+[^\s"',;]+/gi, 'Bearer [redacted]')
    .replace(/\b(password|token|api[_-]?key|secret)(["']?\s*[:=]\s*["']?)[^\s"',;]+/gi, '$1$2[redacted]')
}

export function createFatalErrorReport(error: unknown, context: ReportContext = {}): string {
  const lines = ['Experiment page error']
  if (context.path) lines.push(`Page: ${clean(context.path.split(/[?#]/, 1)[0]!)}`)

  try {
    const deployment: unknown = JSON.parse(context.deployment || 'null')
    for (const [label, key] of [['Build', 'fullSha'], ['Deployment', 'id'], ['Dataset', 'version']]) {
      const value = text(read(deployment, key!))
        || (key === 'fullSha' ? text(read(deployment, 'sha')) : '')
      if (value) lines.push(`${label}: ${clean(value)}`)
    }
  } catch { /* Build identity is optional, including when runtime configuration is the failure. */ }

  const seen = new Set<unknown>()
  let current = error
  for (let depth = 0; depth < 5 && current !== null && current !== undefined; depth++) {
    if (seen.has(current)) {
      lines.push('\n[Repeated cause]')
      break
    }
    seen.add(current)
    const name = text(read(current, 'name')) || 'Error'
    const message = text(read(current, 'message')) || text(read(current, 'statusMessage')) || text(current)
    const status = text(read(current, 'statusCode')) || text(read(current, 'status'))
    lines.push(`\n${depth ? 'Caused by: ' : ''}${clean(name)}: ${clean(message) || 'Unknown error'}`)
    if (status) lines.push(`Status: ${clean(status)}`)
    const stack = text(read(current, 'stack'))
    if (stack) lines.push(clean(stack))
    current = read(current, 'cause')
  }
  if (error === null || error === undefined) lines.push('\nError: Unknown error')
  const report = lines.join('\n')
  return report.length > 32_000 ? `${report.slice(0, 32_000)}\n[Report truncated]` : report
}
