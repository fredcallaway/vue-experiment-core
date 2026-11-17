import { afterEach, expect, test, vi } from 'vitest'
import { generateKeyPairSync } from 'node:crypto'
import { execFile } from 'node:child_process'
import { chmod, mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { configureFirebaseCredentials, firebaseCredentialStatus, firebaseEnvironment, firebaseCommandError } from './firebase-auth'

const exec = promisify(execFile)
const nodeArgs = ['--import', import.meta.resolve('tsx')]
const source = dirname(fileURLToPath(import.meta.url))
const privateKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' })
const roots = []
afterEach(async () => {
  vi.unstubAllEnvs()
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function fixture() {
  const directory = await mkdtemp(resolve(tmpdir(), 'firebase-auth-test-'))
  roots.push(directory)
  vi.stubEnv('HOME', resolve(directory, 'home'))
  const root = resolve(directory, 'experiment')
  const bin = resolve(directory, 'bin')
  await mkdir(root)
  await mkdir(bin)
  const key = {
    type: 'service_account', project_id: 'credential-project',
    client_email: 'deployer@credential-project.iam.gserviceaccount.com', private_key: privateKey,
  }
  const keyFile = resolve(directory, 'key.json')
  await writeFile(keyFile, JSON.stringify(key))
  await writeFile(resolve(root, 'firebase.config.json'), JSON.stringify({ projectId: key.project_id }))
  await exec('git', ['init', '-q'], { cwd: root })
  await exec('git', ['add', 'firebase.config.json'], { cwd: root })
  await exec('git', ['-c', 'user.name=Test', '-c', 'user.email=test@lab.test',
    'commit', '-qm', 'Initial experiment'], { cwd: root })
  await writeFile(resolve(bin, 'firebase'), `#!/usr/bin/env node
const fs = require('node:fs');
const key = JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'));
console.log(JSON.stringify({
  status: 'success', result: key.project_id, identity: key.client_email,
  token: process.env.FIREBASE_TOKEN, config: process.env.XDG_CONFIG_HOME,
  credentialFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
}));
`, { mode: 0o755 })
  const env = {
    ...process.env, TSX_TSCONFIG_PATH: resolve(source, '../../tsconfig.json'), PATH: `${bin}:${process.env.PATH}`,
    FIREBASE_TOKEN: 'unrelated-human-token', GOOGLE_APPLICATION_CREDENTIALS: resolve(directory, 'unrelated-key.json'),
    XDG_CONFIG_HOME: resolve(directory, 'human-firebase-config'),
  }
  const runner = resolve(directory, 'runner.mts')
  await writeFile(runner, `
import { command } from ${JSON.stringify(resolve(source, 'project.ts'))};
import { configureFirebaseCredentials } from ${JSON.stringify(resolve(source, 'firebase-auth.ts'))};
import { assertFirebaseProjectMatchesCli } from ${JSON.stringify(resolve(source, 'firebase-project.ts'))};
const root = process.cwd();
const first = JSON.parse(await command(root, 'firebase', ['hosting:sites:list']));
if (process.argv[2]) await configureFirebaseCredentials(root, process.argv[2]);
const second = JSON.parse(await command(root, 'firebase', ['hosting:sites:list']));
const project = await assertFirebaseProjectMatchesCli(root);
console.log(JSON.stringify({ first, second, project, inheritedToken: process.env.FIREBASE_TOKEN }));
`)
  return { directory, root, key, keyFile, env, runner }
}

test('one-time CLI configuration persists for fresh Node processes despite inherited human credentials', async () => {
  const f = await fixture()
  const before = (await exec('git', ['status', '--porcelain'], { cwd: f.root })).stdout
  const configured = await exec(process.execPath, [...nodeArgs, resolve(source, 'cli.ts'),
    'firebase-auth', 'configure', '--key', f.keyFile], { cwd: f.root, env: f.env })
  const result = JSON.parse(configured.stdout)
  expect(result.serviceAccount).toBe(f.key.client_email)
  expect(configured.stdout).not.toContain(f.key.private_key)
  expect((await stat(result.credentialFile)).mode & 0o777).toBe(0o600)
  expect(JSON.parse(await readFile(result.credentialFile, 'utf8'))).toEqual(f.key)
  expect((await exec('git', ['status', '--porcelain'], { cwd: f.root })).stdout).toBe(before)

  for (let i = 0; i < 2; i++) {
    const { stdout } = await exec(process.execPath, [...nodeArgs, f.runner], { cwd: f.root, env: f.env })
    const observed = JSON.parse(stdout)
    expect(observed.project).toBe(f.key.project_id)
    expect(observed.first.identity).toBe(f.key.client_email)
    expect(observed.second.identity).toBe(f.key.client_email)
    expect(observed.first.token).toBe('')
    expect(observed.first.config).not.toBe(f.env.XDG_CONFIG_HOME)
    expect(observed.inheritedToken).toBe(f.env.FIREBASE_TOKEN)
  }
})

test('an already-running Node caller picks up a rotated key on its next operation', async () => {
  const f = await fixture()
  await configureFirebaseCredentials(f.root, f.keyFile)
  const replacement = { ...f.key, client_email: 'replacement@credential-project.iam.gserviceaccount.com' }
  const replacementFile = resolve(f.directory, 'replacement.json')
  await writeFile(replacementFile, JSON.stringify(replacement))
  const { stdout } = await exec(process.execPath, [...nodeArgs, f.runner, replacementFile], { cwd: f.root, env: f.env })
  const observed = JSON.parse(stdout)
  expect(observed.first.identity).toBe(f.key.client_email)
  expect(observed.second.identity).toBe(replacement.client_email)
})

test('rejects invalid or wrong-project keys without replacing the configured identity or exposing private content', async () => {
  const f = await fixture()
  const configured = await configureFirebaseCredentials(f.root, f.keyFile)
  const bad = resolve(f.directory, 'bad.json')
  await writeFile(bad, JSON.stringify({ ...f.key, project_id: 'different-project' }))
  await expect(configureFirebaseCredentials(f.root, bad)).rejects.toThrow('must belong to the project')
  await writeFile(bad, '{ "private_key": "PRIVATE_TEST_SENTINEL", invalid }')
  await expect(configureFirebaseCredentials(f.root, bad)).rejects.toThrow('Invalid Firebase service-account JSON')
  expect(JSON.parse(await readFile(configured.credentialFile, 'utf8'))).toEqual(f.key)

  await writeFile(resolve(f.root, 'firebase.config.json'), JSON.stringify({ projectId: 'changed-project' }))
  try {
    await exec(process.execPath, [...nodeArgs, f.runner], { cwd: f.root, env: f.env })
    throw new Error('Expected shell fallback to fail with the unrelated shell key')
  } catch (error) {
    expect(error.stderr).toContain('shell credentials for changed-project')
    expect(error.stderr).not.toContain(f.key.private_key)
  }

  await writeFile(resolve(f.root, 'firebase.config.json'), JSON.stringify({ projectId: f.key.project_id }))
  await rm(configured.credentialFile)
  try {
    await exec(process.execPath, [...nodeArgs, f.runner], { cwd: f.root, env: f.env })
    throw new Error('Expected missing project credentials to fail instead of using a human login')
  } catch (error) {
    expect(error.stderr).toContain('The saved project key file is missing')
    expect(error.stderr).not.toContain(f.key.private_key)
  }
})

test('fresh clones and fresh shells share the matching project key after the original checkout is deleted', async () => {
  const f = await fixture()
  const configured = await exec(process.execPath, [...nodeArgs, resolve(source, 'cli.ts'),
    'firebase-auth', 'configure', '--key', f.keyFile], { cwd: f.root, env: f.env })
  const saved = JSON.parse(configured.stdout)
  const clone = resolve(f.directory, 'fresh-clone')
  await exec('git', ['clone', '-q', f.root, clone], { env: f.env })
  await rm(f.root, { recursive: true })
  const freshShell = { HOME: f.env.HOME, PATH: f.env.PATH, TSX_TSCONFIG_PATH: f.env.TSX_TSCONFIG_PATH }
  const { stdout } = await exec(process.execPath, [...nodeArgs, f.runner], { cwd: clone, env: freshShell })
  const observed = JSON.parse(stdout)
  expect(observed.first.credentialFile).toBe(saved.credentialFile)
  expect(observed.first.identity).toBe(f.key.client_email)
  expect((await stat(dirname(saved.credentialFile))).mode & 0o777).toBe(0o700)
  expect((await exec('git', ['status', '--porcelain'], { cwd: clone })).stdout).toBe('')

  await writeFile(resolve(clone, 'firebase.config.json'), JSON.stringify({ projectId: 'another-project' }))
  const shell = await firebaseCredentialStatus(clone)
  expect(shell).toEqual({ projectId: 'another-project', source: 'shell', error: '' })
  expect((await firebaseEnvironment(clone)).GOOGLE_APPLICATION_CREDENTIALS).toBe(process.env.GOOGLE_APPLICATION_CREDENTIALS)
  expect((await firebaseEnvironment(clone)).FIREBASE_TOKEN).toBe(process.env.FIREBASE_TOKEN)
})

test('imports a valid legacy key once, and shared rotation wins over stale checkout copies', async () => {
  const f = await fixture()
  const legacy = resolve(f.root, '.git/firebase-auth')
  await mkdir(legacy)
  await writeFile(resolve(legacy, 'service-account.json'), JSON.stringify(f.key))
  const migrated = await firebaseEnvironment(f.root)
  expect(migrated.GOOGLE_APPLICATION_CREDENTIALS).not.toContain('/.git/')
  expect(JSON.parse(await readFile(migrated.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'))).toEqual(f.key)
  const rotated = { ...f.key, client_email: 'rotated@credential-project.iam.gserviceaccount.com' }
  await writeFile(f.keyFile, JSON.stringify(rotated))
  await configureFirebaseCredentials(f.root, f.keyFile)
  expect((await firebaseCredentialStatus(f.root)).serviceAccount).toBe(rotated.client_email)
  await rm(migrated.GOOGLE_APPLICATION_CREDENTIALS)
  await expect(firebaseEnvironment(f.root)).rejects.toThrow('saved project key file is missing')
})

test('invalid registered credentials fail safely and preserve source metadata for the dashboard', async () => {
  const f = await fixture()
  await expect(configureFirebaseCredentials(f.root, 'absent.json')).rejects.toThrow('Cannot read')
  await writeFile(f.keyFile, JSON.stringify({ ...f.key, private_key: 'invalid PRIVATE_TEST_SENTINEL' }))
  await expect(configureFirebaseCredentials(f.root, f.keyFile)).rejects.toThrow('Invalid service-account private key')
  await writeFile(f.keyFile, JSON.stringify(f.key))
  const configured = await configureFirebaseCredentials(f.root, f.keyFile)
  for (const content of [
    '{"private_key":"PRIVATE_TEST_SENTINEL", broken}',
    JSON.stringify({ ...f.key, project_id: 'wrong-project' }),
    JSON.stringify({ ...f.key, private_key: 'PRIVATE_TEST_SENTINEL' }),
  ]) {
    await writeFile(configured.credentialFile, content)
    const status = await firebaseCredentialStatus(f.root)
    expect(status.source).toBe('project-key')
    expect(status.error).toContain('firebase-auth configure')
    expect(JSON.stringify(status)).not.toContain('PRIVATE_TEST_SENTINEL')
    expect(JSON.stringify(status)).not.toContain('BEGIN PRIVATE KEY')
    expect(JSON.stringify(status)).not.toContain('GOOGLE_APPLICATION_CREDENTIALS')
    await expect(firebaseEnvironment(f.root)).rejects.toThrow('saved project key')
  }
})

test('the dashboard endpoint returns only safe source metadata and observes rotation without a restart', async () => {
  const f = await fixture()
  const h3 = await import('h3')
  Object.assign(globalThis, h3)
  const { createServer } = await import('node:http')
  const handler = (await import('../server/api/prolific/firebase-auth.get.ts')).default
  const app = h3.createApp().use('/auth', handler)
  const server = createServer(h3.toNodeListener(app))
  const cwd = process.cwd()
  process.chdir(f.root)
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${server.address().port}/auth`
  try {
    expect(await (await fetch(url)).json()).toEqual({ projectId: f.key.project_id, source: 'shell', error: '' })
    const configured = await configureFirebaseCredentials(f.root, f.keyFile)
    const response = await fetch(url)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ projectId: f.key.project_id, source: 'project-key',
      serviceAccount: f.key.client_email, error: '' })
    const replacement = { ...f.key, client_email: 'rotated@credential-project.iam.gserviceaccount.com' }
    await writeFile(f.keyFile, JSON.stringify(replacement))
    await configureFirebaseCredentials(f.root, f.keyFile)
    expect((await (await fetch(url)).json()).serviceAccount).toBe(replacement.client_email)
    await rm(configured.credentialFile)
    const error = await (await fetch(url)).json()
    expect(error.source).toBe('project-key')
    expect(error.error).toContain('missing')
    expect(JSON.stringify(error)).not.toContain(f.key.private_key)
  } finally {
    process.chdir(cwd)
    await new Promise(resolve => server.close(resolve))
  }
})

test('CLI execution and project-selection failures retain diagnostics and explain the credential source', async () => {
  const f = await fixture()
  await writeFile(resolve(f.directory, 'bin/firebase'), `#!/usr/bin/env node
console.log(JSON.stringify({ status: 'error', error: { code: 403, message: 'PERMISSION_DENIED: firebasehosting.sites.list' } }));
console.error('HTTP 403 forbidden');
process.exit(1);
`, { mode: 0o755 })
  const runner = resolve(f.directory, 'failure.mts')
  await writeFile(runner, `
import { command } from ${JSON.stringify(resolve(source, 'project.ts'))};
import { assertFirebaseProjectMatchesCli } from ${JSON.stringify(resolve(source, 'firebase-project.ts'))};
for (const call of [() => command(process.cwd(), 'firebase', ['hosting:sites:list']),
  () => assertFirebaseProjectMatchesCli(process.cwd())]) {
  try { await call(); } catch (error) { console.log(error.message); }
}
`)
  const shell = await exec(process.execPath, [...nodeArgs, runner], { cwd: f.root, env: f.env })
  expect(shell.stdout.match(/Firebase permission denied/g)).toHaveLength(2)
  expect(shell.stdout).toContain('shell credentials')
  expect(shell.stdout).toContain('project key may be missing')
  expect(shell.stdout).toContain('firebasehosting.sites.list')
  expect(shell.stdout).not.toContain('select a project with')
  await configureFirebaseCredentials(f.root, f.keyFile)
  const saved = await exec(process.execPath, [...nodeArgs, runner], { cwd: f.root, env: f.env })
  expect(saved.stdout.match(/Firebase permission denied/g)).toHaveLength(2)
  expect(saved.stdout).toContain(`saved project key (${f.key.client_email})`)
  expect(saved.stdout).toContain('project permissions')
  expect(saved.stdout).not.toContain('project key may be missing')
})


test('authentication diagnostics retain useful details while removing private key and token values', () => {
  vi.stubEnv('FIREBASE_TOKEN', 'PRIVATE_SHELL_TOKEN')
  const error = firebaseCommandError({ stderr: JSON.stringify({ code: 401, message: 'UNAUTHENTICATED: expired login',
    private_key: privateKey, access_token: 'PRIVATE_ACCESS_TOKEN', refresh_token: 'PRIVATE_REFRESH_TOKEN' })
    + '\nBearer PRIVATE_BEARER_TOKEN\nPRIVATE_SHELL_TOKEN' },
  { projectId: 'credential-project', source: 'shell' }, 'Firebase command failed')
  expect(error.message).toContain('Firebase authentication failed')
  expect(error.message).toContain('expired login')
  expect(error.message).toContain('shell credentials for credential-project')
  for (const secret of ['BEGIN PRIVATE KEY', 'PRIVATE_ACCESS_TOKEN', 'PRIVATE_REFRESH_TOKEN',
    'PRIVATE_BEARER_TOKEN', 'PRIVATE_SHELL_TOKEN']) expect(error.message).not.toContain(secret)
  const network = firebaseCommandError({ stderr: 'ECONNRESET while contacting Hosting' },
    { projectId: 'credential-project', source: 'shell' }, 'Firebase command failed')
  expect(network.message).toContain('ECONNRESET')
  expect(network.message).not.toContain('permission denied')
  expect(network.message).not.toContain('project key may be missing')
})


test('unreadable registered keys report a repair action and never select shell credentials', async () => {
  if (process.getuid?.() === 0) return
  const f = await fixture()
  const configured = await configureFirebaseCredentials(f.root, f.keyFile)
  await chmod(configured.credentialFile, 0o000)
  const status = await firebaseCredentialStatus(f.root)
  expect(status.source).toBe('project-key')
  expect(status.error).toContain('file permissions')
  expect(status.error).toContain('firebase-auth configure')
  await expect(firebaseEnvironment(f.root)).rejects.toThrow('Cannot read the saved project key')
  await chmod(configured.credentialFile, 0o644)
  await chmod(dirname(configured.credentialFile), 0o755)
  expect((await firebaseCredentialStatus(f.root)).error).toBe('')
  expect((await stat(configured.credentialFile)).mode & 0o777).toBe(0o600)
  expect((await stat(dirname(configured.credentialFile))).mode & 0o777).toBe(0o700)
})
