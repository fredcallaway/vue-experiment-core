import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, mkdir, readdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { DeploymentOperations } from './deployment'
import { command, readJson, writeJson, withOperationLock } from './project'

const roots = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function project() {
  const root = await mkdtemp(resolve(tmpdir(), 'deployment-test-'))
  roots.push(root)
  await writeFile(resolve(root, '.gitignore'), '.output/\n')
  await writeJson(resolve(root, 'firebase.config.json'), { projectId: 'test-project' })
  await writeJson(resolve(root, 'firebase.json'), {
    hosting: { public: '.output/public', predeploy: ['spend-money'], postdeploy: ['spend-more'],
      rewrites: [{ source: '**', destination: '/index.html' }] },
    database: { rules: 'database.rules.json' },
  })
  await command(root, 'git', ['init', '-q'])
  await command(root, 'git', ['config', 'user.email', 'test@example.com'])
  await command(root, 'git', ['config', 'user.name', 'Test'])
  await command(root, 'git', ['add', '.'])
  await command(root, 'git', ['commit', '-qm', 'initial'])
  return root
}

async function deploymentFixture(options = {}) {
  const root = await project()
  const calls = []
  const state = {}
  let remote
  let failTracking = options.failTracking
  const database = {
    get: async path => state[path] ?? null,
    update: async (path, values) => {
      if (failTracking) throw new Error('tracking unavailable')
      expect(path).toBe('')
      Object.assign(state, values)
    },
  }
  const io = {
    run: async (cwd, executable, args) => {
      calls.push({ executable, args })
      if (executable === 'bun' && args[0] === '--eval') return 'cohort-1'
      if (executable === 'bun' && args[0] === 'run') {
        if (options.buildFails) throw new Error('build failed')
        await mkdir(resolve(root, '.output/public'), { recursive: true })
        await writeFile(resolve(root, '.output/public/index.html'), '<html>test</html>')
        if (options.changeDuringBuild) await writeFile(resolve(root, 'user-edit'), 'concurrent edit')
        return ''
      }
      if (executable === 'firebase') {
        const config = await readJson(args[args.indexOf('--config') + 1])
        expect(Object.keys(config)).toEqual(['hosting'])
        expect(config.hosting.predeploy).toBeUndefined()
        expect(config.hosting.postdeploy).toBeUndefined()
        expect(args).toEqual(expect.arrayContaining(['--only', 'hosting', '--project', 'test-project', '--non-interactive']))
        remote = await readJson(resolve(root, '.output/public/ops-deployment.json'))
        return ''
      }
      throw new Error(`Unexpected command: ${executable}`)
    },
    verify: async () => options.wrongBuild ? { wrong: true } : remote,
  }
  return { root, calls, state, operations: new DeploymentOperations(root, database, io),
    allowTracking: () => { failTracking = false } }
}

describe('tracked static Hosting deployment', () => {
  test('verifies the deployed marker and writes UI status and history atomically', async () => {
    const fixture = await deploymentFixture()
    const result = await fixture.operations.deploy()
    expect(result.state).toBe('tracked')
    expect(fixture.state.deployStatus.fullSha).toBe(await command(fixture.root, 'git', ['rev-parse', 'HEAD']))
    expect(fixture.state.deployStatus.sha).toHaveLength(8)
    expect(fixture.state[`deploys/${result.deployedAt}`]).toEqual(fixture.state.deployStatus)
  })

  test.each([{ buildFails: true }, { changeDuringBuild: true }])('does not upload after a failed or changed build: %j', async options => {
    const fixture = await deploymentFixture(options)
    await expect(fixture.operations.deploy()).rejects.toThrow()
    expect(fixture.calls.some(call => call.executable === 'firebase')).toBe(false)
    expect(fixture.state).toEqual({})
  })

  test('never marks a mismatching remote build as deployed', async () => {
    const fixture = await deploymentFixture({ wrongBuild: true })
    await expect(fixture.operations.deploy()).rejects.toThrow('does not match')
    expect(fixture.state).toEqual({})
  })

  test('recovers a successful upload after a tracking failure without uploading again', async () => {
    const fixture = await deploymentFixture({ failTracking: true })
    await expect(fixture.operations.deploy()).rejects.toThrow('tracking unavailable')
    const records = await readdir(resolve(fixture.root, '.git/agent-operations/deployments'))
    fixture.allowTracking()
    const result = await fixture.operations.reconcile(records[0].replace('.json', ''))
    expect(result.state).toBe('tracked')
    expect(fixture.calls.filter(call => call.executable === 'firebase')).toHaveLength(1)
  })

  test('rejects overlapping local operations', async () => {
    const root = await project()
    await withOperationLock(root, async () => {
      await expect(withOperationLock(root, async () => {})).rejects.toThrow('Another operation')
    })
    await withOperationLock(root, async () => {})
  })
})
