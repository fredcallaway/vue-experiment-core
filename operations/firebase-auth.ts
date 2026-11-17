import { execFile } from 'node:child_process'
import { createPrivateKey, randomUUID } from 'node:crypto'
import { chmod, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const configureCommand = 'npm run ops -- firebase-auth configure --key <file>'

export type FirebaseCredentialSource = {
  projectId: string
  source: 'project-key' | 'shell'
  serviceAccount?: string
}

async function projectIdentity(root: string) {
  const config = JSON.parse(await readFile(resolve(root, 'firebase.config.json'), 'utf8'))
  if (typeof config.projectId !== 'string' || !/^[a-z][a-z0-9-]*$/.test(config.projectId)) {
    throw new Error('Set a valid Firebase project ID in firebase.config.json')
  }
  return config.projectId as string
}

function credentialDirectory(projectId: string) {
  // Independent of shell XDG_CONFIG_HOME, which is isolated for Firebase CLI calls below.
  return resolve(homedir(), '.config', 'experiment-template', 'firebase', projectId)
}

function validateCredentials(projectId: string, contents: string) {
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
  if (key.project_id !== projectId) {
    throw new Error('The service-account key must belong to the project in firebase.config.json')
  }
  try { createPrivateKey(key.private_key) } catch { throw new Error('Invalid service-account private key') }
  return { projectId, serviceAccount: key.client_email as string }
}

async function saveCredentials(projectId: string, contents: string) {
  const directory = credentialDirectory(projectId)
  await mkdir(directory, { recursive: true, mode: 0o700 })
  await chmod(directory, 0o700)
  const credentialFile = resolve(directory, 'service-account.json')
  const temporary = resolve(directory, `${randomUUID()}.tmp`)
  try {
    await writeFile(temporary, contents, { mode: 0o600, flag: 'wx' })
    await rename(temporary, credentialFile)
  } finally {
    await rm(temporary, { force: true })
  }
  return credentialFile
}

export async function configureFirebaseCredentials(root: string, keyFile: string) {
  if (!keyFile) throw new Error('Provide the service-account JSON key with --key <file>')
  const projectId = await projectIdentity(root)
  let contents: string
  try { contents = await readFile(resolve(root, keyFile), 'utf8') } catch {
    throw new Error('Cannot read the service-account key file; check its path and file permissions')
  }
  const identity = validateCredentials(projectId, contents)
  return { ...identity, credentialFile: await saveCredentials(projectId, contents) }
}

export function describeFirebaseCredentials(source: FirebaseCredentialSource) {
  return source.source === 'project-key'
    ? `saved project key${source.serviceAccount ? ` (${source.serviceAccount})` : ''} for ${source.projectId}`
    : `shell credentials for ${source.projectId} (no saved project key)`
}

async function legacyCredentials(root: string) {
  let directory: string
  try {
    const { stdout } = await exec('git', ['rev-parse', '--git-path', 'firebase-auth'], { cwd: root })
    directory = resolve(root, stdout.trim())
  } catch { return null }
  return readCredentials(directory)
}

async function readCredentials(directory: string) {
  try { return await readFile(resolve(directory, 'service-account.json'), 'utf8') } catch (error: any) {
    if (error.code !== 'ENOENT') throw new Error('Cannot read the saved project key; check its file permissions')
    const configured = await stat(directory).catch((error) => {
      if (error.code !== 'ENOENT') {
        throw new Error('Cannot read the project credential directory; check its permissions')
      }
      return null
    })
    if (!configured) return null
    throw new Error('The saved project key file is missing')
  }
}

export async function resolveFirebaseCredentials(root: string) {
  const projectId = await projectIdentity(root)
  const directory = credentialDirectory(projectId)
  const source: FirebaseCredentialSource = { projectId, source: 'project-key' }
  try {
    let contents = await readCredentials(directory)
    if (contents === null) {
      // Import a validated old checkout key once. A shared key always takes precedence over legacy copies.
      contents = await legacyCredentials(root)
      if (contents !== null) {
        validateCredentials(projectId, contents)
        await saveCredentials(projectId, contents)
      }
    }
    if (contents === null) {
      return { source: { projectId, source: 'shell' } as FirebaseCredentialSource, environment: { ...process.env } }
    }
    const identity = validateCredentials(projectId, contents)
    source.serviceAccount = identity.serviceAccount
    await chmod(directory, 0o700)
    const credentialFile = resolve(directory, 'service-account.json')
    await chmod(credentialFile, 0o600)
    return { source, environment: {
      ...process.env,
      GOOGLE_APPLICATION_CREDENTIALS: credentialFile,
      XDG_CONFIG_HOME: resolve(directory, 'cli-config'),
      FIREBASE_TOKEN: '',
    } }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not load project credentials'
    throw new Error(`Firebase credentials: ${describeFirebaseCredentials(source)}. ` +
      `${message}. Run ${configureCommand}.`)
  }
}

export async function firebaseEnvironment(root: string): Promise<NodeJS.ProcessEnv> {
  return (await resolveFirebaseCredentials(root)).environment
}

export async function firebaseCredentialStatus(root: string) {
  try {
    return { ...(await resolveFirebaseCredentials(root)).source, error: '' }
  } catch (error) {
    // Only source metadata and a controlled diagnostic, never the environment or key contents.
    return { projectId: await projectIdentity(root), source: 'project-key' as const,
      error: error instanceof Error ? error.message : 'Could not load project credentials' }
  }
}

export function firebaseDiagnostic(error: { stdout?: unknown; stderr?: unknown; message?: string }) {
  let diagnostic = [error.stdout, error.stderr || error.message].filter(Boolean).join('\n').trim()
  diagnostic = diagnostic
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, '[redacted key]')
    .replace(/("(?:private_key|access_token|refresh_token)"\s*:\s*)"(?:\\.|[^"\\])*"/g, '$1"[redacted]"')
    .replace(/Bearer\s+[^\s"']+/gi, 'Bearer [redacted]')
  if (process.env.FIREBASE_TOKEN) diagnostic = diagnostic.replaceAll(process.env.FIREBASE_TOKEN, '[redacted]')
  return diagnostic || 'Firebase CLI failed without diagnostics'
}

export function firebaseCommandError(error: { stdout?: unknown; stderr?: unknown; message?: string },
  source: FirebaseCredentialSource, operation: string) {
  const diagnostic = firebaseDiagnostic(error)
  const permission = /\b403\b|PERMISSION_DENIED|forbidden|(?:insufficient|missing|lack|denied|not have).*permission/i
    .test(diagnostic)
  const authentication = /\b401\b|UNAUTHENTICATED|invalid_grant|invalid.*credential|authenticat|log(?:ged)? in/i
    .test(diagnostic)
  const reason = permission ? 'Firebase permission denied'
    : authentication ? 'Firebase authentication failed' : operation
  const recovery = permission || authentication
    ? source.source === 'shell'
      ? ` A project key may be missing. Run ${configureCommand}, or check your shell Firebase login and project access.`
      : ` Check this service account's project permissions and whether its key has been revoked; ` +
        `replace it with ${configureCommand}.`
    : ''
  return new Error(`${reason}. Credentials: ${describeFirebaseCredentials(source)}.${recovery}\n${diagnostic}`)
}
