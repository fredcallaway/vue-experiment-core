import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { promisify } from 'node:util'

const exec = promisify(execFile)

async function credentialDirectory(root: string) {
  const { stdout } = await exec('git', ['rev-parse', '--git-path', 'firebase-auth'], { cwd: root })
  return resolve(root, stdout.trim())
}

async function validateCredentials(root: string, contents: string) {
  let key
  try {
    key = JSON.parse(contents)
  } catch {
    throw new Error('Invalid Firebase service-account JSON')
  }
  if (key?.type !== 'service_account' || ['client_email', 'private_key', 'project_id'].some(name =>
    typeof key[name] !== 'string' || !key[name])) {
    throw new Error('Expected a Firebase service-account JSON key with project_id, client_email, and private_key')
  }
  const config = JSON.parse(await readFile(resolve(root, 'firebase.config.json'), 'utf8'))
  if (!config.projectId || key.project_id !== config.projectId) {
    throw new Error('The service-account key must belong to the project in firebase.config.json')
  }
  return { projectId: key.project_id as string, serviceAccount: key.client_email as string }
}

export async function configureFirebaseCredentials(root: string, keyFile: string) {
  if (!keyFile) throw new Error('Provide the service-account JSON key with --key <file>')
  const contents = await readFile(resolve(root, keyFile), 'utf8')
  const identity = await validateCredentials(root, contents)
  const directory = await credentialDirectory(root)
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const credentialFile = resolve(directory, 'service-account.json')
  const temporary = resolve(directory, `${randomUUID()}.tmp`)
  try {
    await writeFile(temporary, contents, { mode: 0o600, flag: 'wx' })
    await rename(temporary, credentialFile)
  } finally {
    await rm(temporary, { force: true })
  }
  return { ...identity, credentialFile }
}

export async function firebaseEnvironment(root: string): Promise<NodeJS.ProcessEnv> {
  const directory = await credentialDirectory(root)
  const credentialFile = resolve(directory, 'service-account.json')
  let contents
  try {
    contents = await readFile(credentialFile, 'utf8')
  } catch (error: any) {
    if (error.code !== 'ENOENT') throw error
    const configured = await stat(directory).catch((error) => {
      if (error.code !== 'ENOENT') throw error
      return null
    })
    if (!configured) return process.env
    throw new Error('Project Firebase credentials are missing; run firebase-auth configure --key <file> again')
  }
  await validateCredentials(root, contents)
  return {
    ...process.env,
    GOOGLE_APPLICATION_CREDENTIALS: credentialFile,
    XDG_CONFIG_HOME: resolve(directory, 'config'),
    FIREBASE_TOKEN: '',
  }
}
