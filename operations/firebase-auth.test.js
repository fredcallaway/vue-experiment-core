import { afterEach, expect, test } from 'bun:test'
import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { configureFirebaseCredentials } from './firebase-auth'

const exec = promisify(execFile)
const source = dirname(fileURLToPath(import.meta.url))
const roots = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function fixture() {
  const directory = await mkdtemp(resolve(tmpdir(), 'firebase-auth-test-'))
  roots.push(directory)
  const root = resolve(directory, 'experiment')
  const bin = resolve(directory, 'bin')
  await mkdir(root)
  await mkdir(bin)
  const key = {
    type: 'service_account', project_id: 'credential-project',
    client_email: 'deployer@credential-project.iam.gserviceaccount.com', private_key: 'PRIVATE_TEST_SENTINEL',
  }
  const keyFile = resolve(directory, 'key.json')
  await writeFile(keyFile, JSON.stringify(key))
  await writeFile(resolve(root, 'firebase.config.json'), JSON.stringify({ projectId: key.project_id }))
  await exec('git', ['init', '-q'], { cwd: root })
  await exec('git', ['add', 'firebase.config.json'], { cwd: root })
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
    ...process.env, PATH: `${bin}:${process.env.PATH}`,
    FIREBASE_TOKEN: 'unrelated-human-token', GOOGLE_APPLICATION_CREDENTIALS: resolve(directory, 'unrelated-key.json'),
    XDG_CONFIG_HOME: resolve(directory, 'human-firebase-config'),
  }
  const runner = resolve(directory, 'runner.ts')
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

test('one-time CLI configuration persists for fresh Bun and Node processes despite inherited human credentials', async () => {
  const f = await fixture()
  const before = (await exec('git', ['status', '--porcelain'], { cwd: f.root })).stdout
  const configured = await exec(process.execPath, [resolve(source, 'cli.ts'),
    'firebase-auth', 'configure', '--key', f.keyFile], { cwd: f.root, env: f.env })
  const result = JSON.parse(configured.stdout)
  expect(result.serviceAccount).toBe(f.key.client_email)
  expect(configured.stdout).not.toContain(f.key.private_key)
  expect((await stat(result.credentialFile)).mode & 0o777).toBe(0o600)
  expect(JSON.parse(await readFile(result.credentialFile, 'utf8'))).toEqual(f.key)
  expect((await exec('git', ['status', '--porcelain'], { cwd: f.root })).stdout).toBe(before)

  const bundled = resolve(f.directory, 'runner.mjs')
  await exec(process.execPath, ['build', f.runner, '--target', 'node', '--outfile', bundled])
  for (const [executable, script] of [[process.execPath, f.runner], ['node', bundled]]) {
    const { stdout } = await exec(executable, [script], { cwd: f.root, env: f.env })
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
  const bundled = resolve(f.directory, 'runner.mjs')
  await exec(process.execPath, ['build', f.runner, '--target', 'node', '--outfile', bundled])
  const { stdout } = await exec('node', [bundled, replacementFile], { cwd: f.root, env: f.env })
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
    await exec(process.execPath, [f.runner], { cwd: f.root, env: f.env })
    throw new Error('Expected a project mismatch')
  } catch (error) {
    expect(error.stderr).toContain('must belong to the project')
    expect(error.stderr).not.toContain(f.key.private_key)
  }

  await rm(configured.credentialFile)
  try {
    await exec(process.execPath, [f.runner], { cwd: f.root, env: f.env })
    throw new Error('Expected missing project credentials to fail instead of using a human login')
  } catch (error) {
    expect(error.stderr).toContain('Project Firebase credentials are missing')
    expect(error.stderr).not.toContain(f.key.private_key)
  }
})
