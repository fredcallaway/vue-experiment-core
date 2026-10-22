import { createServer } from 'node:http'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { safeBrowser } from '../browser.mjs'
import { saveJson } from './client.mjs'
import { createAgentSession } from './session.mjs'

export async function serveAgentSession(options) {
  const idleMinutes = options.idleMinutes ?? 30
  if (!Number.isFinite(idleMinutes) || idleMinutes <= 0 || idleMinutes > 24 * 60) {
    throw new Error('idleMinutes must be between 0 and 1440')
  }
  const runtime = await safeBrowser(options)
  let session
  try {
    await runtime.page.goto(runtime.url, { waitUntil: 'domcontentloaded' })
    await runtime.page.locator(options.rootSelector || '.main-content').waitFor({ state: 'visible', timeout: 30_000 })
    session = await createAgentSession(options, runtime)
  } catch (error) {
    await runtime.close()
    throw error
  }
  const token = randomBytes(32).toString('hex')
  let lastCommand = Date.now()
  let queue = Promise.resolve()
  let closing = false
  const reply = (response, status, payload) => {
    response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
    response.end(JSON.stringify(payload))
  }
  const server = createServer(async (request, response) => {
    const authorization = Buffer.from(request.headers.authorization || '')
    const expected = Buffer.from(`Bearer ${token}`)
    if (request.method !== 'POST' || request.url !== '/command' || request.headers.origin
      || authorization.length !== expected.length || !timingSafeEqual(authorization, expected)) {
      reply(response, 403, { ok: false, error: 'Forbidden' })
      return
    }
    if (request.headers['content-type']?.split(';')[0] !== 'application/json') {
      reply(response, 415, { ok: false, error: 'Content-Type must be application/json' })
      return
    }
    try {
      let body = ''
      for await (const chunk of request) {
        body += chunk
        if (Buffer.byteLength(body) > 256 * 1024) throw new Error('Command exceeds 256 KiB')
      }
      const { command, payload = {}, ...extra } = JSON.parse(body)
      if (Object.keys(extra).length || !['observe', 'act', 'checkpoint', 'finish', 'compile', 'stop'].includes(command)) {
        throw new Error('Unknown command or command fields')
      }
      lastCommand = Date.now()
      const result = queue.then(async () => {
        if (closing) throw new Error('Session is closing')
        if (command === 'stop') return { status: 'stopped', runStatus: session.status }
        return session[command](payload)
      })
      queue = result.catch(() => {})
      reply(response, 200, { ok: true, result: await result })
      if (command === 'stop') await close()
    } catch (error) {
      reply(response, 400, { ok: false, error: error.message })
    }
  })
  server.requestTimeout = 10_000
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const descriptor = {
    version: 1, id: options.id, token, port: server.address().port, pid: process.pid,
    output: options.output, createdAt: new Date().toISOString(), idleMinutes,
  }
  await saveJson(join(options.output, 'session.json'), descriptor)
  const timer = setInterval(() => {
    if (Date.now() - lastCommand > idleMinutes * 60_000) close().catch(console.error)
  }, Math.min(idleMinutes * 60_000, 10_000))
  async function close() {
    if (closing) return
    closing = true
    clearInterval(timer)
    await queue
    await session.close()
    await new Promise(resolve => server.close(resolve))
  }
  process.once('SIGTERM', () => close().catch(console.error))
  process.once('SIGINT', () => close().catch(console.error))
  return { descriptor, close }
}

if (import.meta.main || fileURLToPath(import.meta.url) === process.argv[1]) {
  const options = JSON.parse(await readFile(process.argv[2], 'utf8'))
  serveAgentSession(options).catch(error => {
    console.error(error)
    process.exitCode = 1
  })
}
