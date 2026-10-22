import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const serverPath = fileURLToPath(new URL('./server.mjs', import.meta.url))
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))

export async function readSession(path) {
  const session = JSON.parse(await readFile(resolve(path), 'utf8'))
  if (session.version !== 1 || !Number.isInteger(session.port) || session.port < 1 || session.port > 65535
    || typeof session.token !== 'string' || session.token.length !== 64) {
    throw new Error('Invalid agent session descriptor')
  }
  return session
}

export async function agentCommand(sessionPath, command, payload = {}) {
  const session = await readSession(sessionPath)
  const response = await fetch(`http://127.0.0.1:${session.port}/command`, {
    method: 'POST',
    headers: { authorization: `Bearer ${session.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ command, payload }),
    signal: AbortSignal.timeout(60_000),
  })
  const result = await response.json()
  if (!response.ok || !result.ok) throw new Error(result.error || `Agent server returned HTTP ${response.status}`)
  return result.result
}

export async function startAgentSession(options) {
  if (!options || typeof options.url !== 'string') throw new Error('A local experiment URL is required')
  const allowed = ['id', 'url', 'output', 'seed', 'fast', 'rootSelector', 'scope', 'viewport', 'idleMinutes', 'project']
  const unknown = Object.keys(options).find(key => !allowed.includes(key))
  if (unknown) throw new Error(`Unknown session option ${unknown}`)
  const id = options.id || `agent-${Date.now()}-${randomUUID().slice(0, 8)}`
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('Session id must contain only letters, digits, underscores or hyphens')
  const output = resolve(options.output || join('.experiment-tests', 'agent', id))
  const sessionPath = join(output, 'session.json')
  await mkdir(output, { recursive: true })
  try {
    await stat(sessionPath)
    throw new Error(`Session already exists: ${sessionPath}`)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  const configPath = join(output, 'config.json')
  await writeFile(configPath, JSON.stringify({ ...options, id, output }, null, 2), { flag: 'wx', mode: 0o600 })
  const log = await open(join(output, 'server.log'), 'a', 0o600)
  let child
  try {
    child = spawn('node', [serverPath, configPath], {
      detached: true,
      stdio: ['ignore', log.fd, log.fd],
      cwd: process.cwd(),
    })
    let launchError
    child.on('error', error => { launchError = error })
    child.unref()
    for (let attempt = 0; attempt < 300; attempt++) {
      if (launchError) throw launchError
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error(`Agent server exited during startup. Read ${join(output, 'server.log')}`)
      }
      try {
        const session = await readSession(sessionPath)
        const observation = await agentCommand(sessionPath, 'observe')
        return { sessionPath, ...session, observation }
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
      }
      await pause(100)
    }
    throw new Error(`Agent server startup timed out. Read ${join(output, 'server.log')}`)
  } catch (error) {
    child?.kill('SIGTERM')
    throw error
  } finally {
    await log.close()
  }
}

export async function saveJson(path, value) {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.${randomUUID()}.tmp`
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  await rename(temporary, path)
}
