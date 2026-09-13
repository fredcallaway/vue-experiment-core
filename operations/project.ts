import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const exec = promisify(execFile)

export async function command(root: string, executable: string, args: string[]) {
  try {
    const { stdout, stderr } = await exec(executable, args, { cwd: root, maxBuffer: 32 * 1024 * 1024 })
    if (stderr) process.stderr.write(stderr)
    return stdout.trim()
  } catch (error: any) {
    throw new Error(`${executable} ${args.join(' ')} failed\n${error.stdout ?? ''}\n${error.stderr ?? error.message}`)
  }
}

export const readJson = async (file: string) => JSON.parse(await readFile(file, 'utf8'))

export async function writeJson(file: string, value: unknown) {
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify(value, null, 2) + '\n', { flag: 'w' })
}

export function safeSegment(value: string, label: string) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(value)) throw new Error(`Invalid ${label}: ${value}`)
  return value
}

export async function gitSnapshot(root: string) {
  const sha = await command(root, 'git', ['rev-parse', 'HEAD'])
  const status = await command(root, 'git', ['status', '--porcelain', '--untracked-files=all', '--ignore-submodules=none'])
  const submodules = await command(root, 'git', ['submodule', 'status', '--recursive'])
  if (status || submodules.split('\n').some(line => /^[+-U]/.test(line))) {
    throw new Error(`A clean, committed checkout and initialized matching submodules are required.\n${status}\n${submodules}`)
  }
  return { sha, submodules }
}

export async function unchanged(root: string, snapshot: Awaited<ReturnType<typeof gitSnapshot>>) {
  if (JSON.stringify(await gitSnapshot(root)) !== JSON.stringify(snapshot)) {
    throw new Error('Checkout changed during the operation; refusing to proceed')
  }
}

export async function operationDirectory(root: string) {
  return resolve(root, await command(root, 'git', ['rev-parse', '--git-path', 'agent-operations']))
}

export async function withOperationLock<T>(root: string, fn: () => Promise<T>): Promise<T> {
  const { open, unlink } = await import('node:fs/promises')
  const directory = await operationDirectory(root)
  await mkdir(directory, { recursive: true })
  const file = resolve(directory, 'lock')
  const handle = await open(file, 'wx').catch(() => {
    throw new Error(`Another operation is running. If it was interrupted, inspect and remove ${file} before retrying.`)
  })
  try {
    await handle.writeFile(JSON.stringify({ pid: process.pid, startedAt: Date.now() }))
    return await fn()
  } finally {
    await handle.close()
    await unlink(file)
  }
}
