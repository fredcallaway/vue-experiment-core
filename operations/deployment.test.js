import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import { mkdtemp, mkdir, readdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { DeploymentOperations } from './deployment'
import { command, gitSnapshot, readJson, writeJson, withOperationLock } from './project'
import { ProlificHttpReader } from './prolific-reader'

const roots = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function project() {
  const root = await mkdtemp(resolve(tmpdir(), 'deployment-test-'))
  roots.push(root)
  await writeFile(resolve(root, '.gitignore'), '.output/\n')
  await writeFile(resolve(root, 'epoch.config.ts'),
    'export default defineEpochConfig({ version: "cohort-1", contactEmail: "researcher@university.edu" })\n')
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
  const state = { deploymentVersion: 'cohort-1' }
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
    getActiveStudies: async (_root, projectId) => {
      expect(projectId).toBe('fixture-prolific')
      return options.activeStudies?.(calls) ?? []
    },
    run: async (cwd, executable, args, environment) => {
      calls.push({ executable, args, environment })
      if (executable === 'bun' && args[0] === '--eval') return command(cwd, executable, args)
      if (executable === 'bun' && args[0] === 'run') {
        expect(args).toEqual(['run', 'generate', '--envName', 'deployment'])
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
  test('requires confirmation for active study IDs and rechecks after generation', async () => {
    const first = { id: 'first', name: 'Recruiting study' }
    const next = { id: 'next', name: 'Newly active study' }
    const fixture = await deploymentFixture({ activeStudies: calls => calls.some(call => call.args[0] === 'run')
      ? [first, next] : [first] })
    fixture.state.prolificProjectId = 'fixture-prolific'
    expect((await fixture.operations.inspect()).activeStudies).toEqual([first])
    await expect(fixture.operations.deploy({ allowVersionReuse: true })).rejects.toThrow('--allow-live-studies first')
    expect(fixture.calls.some(call => call.args[0] === 'run')).toBe(false)
    await expect(fixture.operations.deploy({ allowLiveStudies: ['first'] })).rejects.toThrow('--allow-live-studies first,next')
    expect(fixture.calls.some(call => call.executable === 'firebase')).toBe(false)
    expect((await fixture.operations.deploy({ allowLiveStudies: ['first', 'next'] })).state).toBe('tracked')
  })

  test('blocks a linked project when its active studies cannot be checked', async () => {
    const fixture = await deploymentFixture({ activeStudies: () => { throw new Error('token unavailable') } })
    fixture.state.prolificProjectId = 'fixture-prolific'
    await expect(fixture.operations.deploy({ allowLiveStudies: ['first'] })).rejects.toThrow('Could not check active studies')
    expect(fixture.calls.some(call => call.args[0] === 'run')).toBe(false)
  })

  test('reads only ACTIVE studies in the selected Prolific project, across pages', async () => {
    const fetch = spyOn(globalThis, 'fetch').mockImplementation(async request => {
      const url = new URL(request)
      expect(url.pathname).toBe('/api/v1/projects/fixture-prolific/studies/')
      expect(url.searchParams.get('status')).toBe('ACTIVE')
      return Response.json(url.searchParams.get('page') === '1' ? {
        results: [
          { id: 'active', name: 'Active', status: 'ACTIVE' },
          { id: 'paused', name: 'Paused', status: 'PAUSED' },
          { id: 'review', name: 'Review', status: 'AWAITING REVIEW' },
        ],
        _links: { next: { href: 'next-page' } },
      } : { results: [{ id: 'second', name: 'Second', status: 'ACTIVE' }] })
    })
    try {
      expect(await new ProlificHttpReader('fixture-token').getActiveStudies('fixture-prolific')).toEqual([
        { id: 'active', name: 'Active' }, { id: 'second', name: 'Second' },
      ])
    } finally {
      fetch.mockRestore()
    }
  })

  test('blocks placeholder contact email before build/upload, even with the version override', async () => {
    const fixture = await deploymentFixture()
    await writeFile(resolve(fixture.root, 'epoch.config.ts'),
      'export default { version: "cohort-1", contactEmail: "yourEmailAddress@fakeDomain.foo" }\n')
    await expect(fixture.operations.deploy({ allowVersionReuse: true })).rejects.toThrow('Set contactEmail')
    expect(fixture.calls).toHaveLength(1)
    expect(fixture.state.deployStatus).toBeUndefined()
  })

  test('allows bugfix redeployment before posting and another batch of the same posted build', async () => {
    const fixture = await deploymentFixture()
    fixture.state.studies = { draft: { version: 'cohort-1', sha: 'aaaaaaaa' } }
    const first = await fixture.operations.deploy()
    await writeFile(resolve(fixture.root, 'fix.ts'), '// fix noticed before posting\n')
    await command(fixture.root, 'git', ['add', 'fix.ts'])
    await command(fixture.root, 'git', ['commit', '-qm', 'fix before posting'])
    const second = await fixture.operations.deploy()
    expect(second.fullSha).not.toBe(first.fullSha)
    fixture.state.studies.posted = { version: second.version, sha: second.sha, publishTime: Date.now() }
    expect((await fixture.operations.inspect()).warnings).toEqual([])
    expect((await fixture.operations.deploy()).state).toBe('tracked')
  })

  test('requires deliberate override when a posted version has different code', async () => {
    const fixture = await deploymentFixture()
    fixture.state.studies = { posted: { version: 'cohort-1', sha: 'aaaaaaaa', publishTime: 1 } }
    expect((await fixture.operations.inspect()).warnings).toMatchObject([{ studyId: 'posted', version: 'cohort-1' }])
    await expect(fixture.operations.deploy()).rejects.toThrow('--allow-version-reuse')
    expect(fixture.calls.some(call => call.executable === 'firebase' || call.args[0] === 'run')).toBe(false)
    expect((await fixture.operations.deploy({ allowVersionReuse: true })).state).toBe('tracked')
  })

  test('accepts initialized submodules whose SHA starts with a digit and rejects uninitialized submodules', async () => {
    const source = await project()
    let sha = await command(source, 'git', ['rev-parse', 'HEAD'])
    // Exercise a numeric hash prefix, which must not be mistaken for a Git status character.
    for (let i = 0; !/^\d/.test(sha) && i < 100; i++) {
      await command(source, 'git', ['commit', '--allow-empty', '-qm', `fixture ${i}`])
      sha = await command(source, 'git', ['rev-parse', 'HEAD'])
    }
    expect(sha).toMatch(/^\d/)
    const root = await project()
    await command(root, 'git', ['-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', source, 'core'])
    await command(root, 'git', ['commit', '-qm', 'add submodule'])
    expect((await gitSnapshot(root)).submodules).toContain(sha)
    await command(root, 'git', ['submodule', 'deinit', '--force', '--all'])
    await expect(gitSnapshot(root)).rejects.toThrow('initialized matching submodules')
  })

  test('verifies the deployed marker and writes UI status and history atomically', async () => {
    const fixture = await deploymentFixture()
    const result = await fixture.operations.deploy()
    expect(result.state).toBe('tracked')
    expect(fixture.state.deployStatus.fullSha).toBe(await command(fixture.root, 'git', ['rev-parse', 'HEAD']))
    expect(fixture.state.deployStatus.sha).toHaveLength(8)
    expect(fixture.state[`deploys/${result.deployedAt}`]).toEqual(fixture.state.deployStatus)
    const build = fixture.calls.find(call => call.args[0] === 'run')
    expect(JSON.parse(build.environment.EXPERIMENT_DEPLOYMENT)).toEqual(fixture.state.deployStatus)
  })

  test('uses the UI selection or an explicit version without editing source', async () => {
    const fixture = await deploymentFixture()
    fixture.state.deploymentVersion = 'pilot-with-longer-instructions'
    const first = await fixture.operations.deploy()
    expect(first.version).toBe(fixture.state.deploymentVersion)
    const second = await fixture.operations.deploy({ version: 'main-study' })
    expect(second.version).toBe('main-study')
    expect(second.fullSha).toBe(first.fullSha)
    delete fixture.state.deploymentVersion
    await expect(fixture.operations.deploy()).rejects.toThrow('Choose a dataset version')
    await expect(fixture.operations.deploy({ version: '../escape' })).rejects.toThrow('Choose a dataset version')
  })

  test.each([{ buildFails: true }, { changeDuringBuild: true }])('does not upload after a failed or changed build: %j', async options => {
    const fixture = await deploymentFixture(options)
    await expect(fixture.operations.deploy()).rejects.toThrow()
    expect(fixture.calls.some(call => call.executable === 'firebase')).toBe(false)
    expect(fixture.state.deployStatus).toBeUndefined()
  })

  test('never marks a mismatching remote build as deployed', async () => {
    const fixture = await deploymentFixture({ wrongBuild: true })
    await expect(fixture.operations.deploy()).rejects.toThrow('does not match')
    expect(fixture.state.deployStatus).toBeUndefined()
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
