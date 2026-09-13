import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import type { OperationsDatabase } from './database'
import { command, gitSnapshot, operationDirectory, readJson, safeSegment, unchanged, writeJson } from './project'

type Deployment = {
  id: string
  sha: string
  fullSha: string
  submodules: string
  version: string
  projectId: string
  site: string
  deployedAt: number
}

type DeploymentRecord = {
  deployment: Deployment
  state: 'prepared' | 'uploading' | 'verified' | 'tracked'
}

export type DeploymentAdapters = {
  run: typeof command
  verify: (url: string) => Promise<unknown>
}

const adapters: DeploymentAdapters = {
  run: command,
  verify: async (url) => {
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(30_000) })
    if (!response.ok) throw new Error(`Hosted build verification failed: HTTP ${response.status}`)
    return response.json()
  },
}

export class DeploymentOperations {
  constructor(
    private root: string,
    private database: OperationsDatabase,
    private io = adapters,
  ) {}

  private async config() {
    const firebase = await readJson(resolve(this.root, 'firebase.config.json'))
    const config = await readJson(resolve(this.root, 'firebase.json'))
    const projectId = safeSegment(firebase.projectId ?? '', 'Firebase project ID')
    const hosting = config.hosting
    if (!hosting || Array.isArray(hosting) || hosting.target) {
      throw new Error('Configure one Hosting site using hosting.site (or the default project site), without target aliases')
    }
    const site = safeSegment(hosting.site ?? projectId, 'Hosting site')
    if (hosting.public !== '.output/public') throw new Error('Hosting public must be .output/public')
    // Static Hosting only: no functions, Cloud Run, hooks, or other service deployment.
    if (hosting.source || hosting.frameworksBackend || hosting.rewrites?.some((r: any) => !r.destination)) {
      throw new Error('Only static Hosting rewrites are supported')
    }
    const { predeploy, postdeploy, ...staticHosting } = hosting
    return { projectId, site, hosting: staticHosting }
  }

  async inspect() {
    const snapshot = await gitSnapshot(this.root)
    const config = await this.config()
    const version = await this.io.run(this.root, 'bun', ['--eval',
      'globalThis.defineEpochConfig = c => c; console.log((await import("./epoch.config.ts")).default.version)',
    ])
    safeSegment(version, 'experiment version')
    return { ...snapshot, version, projectId: config.projectId, site: config.site,
      url: `https://${config.site}.web.app`, tracked: await this.database.get('deployStatus') }
  }

  private async recordPath(id: string) {
    return resolve(await operationDirectory(this.root), 'deployments', `${safeSegment(id, 'operation ID')}.json`)
  }

  private async verify(deployment: Deployment) {
    const url = `https://${deployment.site}.web.app/ops-deployment.json?operation=${deployment.id}`
    const live = await this.io.verify(url)
    if (JSON.stringify(live) !== JSON.stringify(deployment)) {
      throw new Error(`Hosted build does not match deployment ${deployment.id}`)
    }
  }

  private async track(record: DeploymentRecord) {
    const info = record.deployment
    // Preserve the short SHA and timestamp history keys consumed by the existing study UI.
    await this.database.update('', { deployStatus: info, [`deploys/${info.deployedAt}`]: info })
    const saved = await this.database.get<Deployment>('deployStatus')
    if (saved?.id !== info.id || saved?.fullSha !== info.fullSha) throw new Error('Deployment tracking verification failed')
    record.state = 'tracked'
    await writeJson(await this.recordPath(info.id), record)
    return { ...info, state: record.state, url: `https://${info.site}.web.app` }
  }

  async deploy() {
    const inspected = await this.inspect()
    const snapshot = { sha: inspected.sha, submodules: inspected.submodules }
    const config = await this.config()
    const deployment: Deployment = {
      id: randomUUID(), sha: inspected.sha.slice(0, 8), fullSha: inspected.sha,
      submodules: inspected.submodules, version: inspected.version,
      projectId: config.projectId, site: config.site, deployedAt: Date.now(),
    }
    const record: DeploymentRecord = { deployment, state: 'prepared' }
    const recordPath = await this.recordPath(deployment.id)
    await writeJson(recordPath, record)
    process.stderr.write(`Deployment ${deployment.id}; recovery record: ${recordPath}\n`)
    const temporary = await mkdtemp(resolve(tmpdir(), 'experiment-hosting-'))
    try {
      await this.io.run(this.root, 'bun', ['run', 'generate'])
      await unchanged(this.root, snapshot)
      await readFile(resolve(this.root, '.output/public/index.html'))
      await writeJson(resolve(this.root, '.output/public/ops-deployment.json'), deployment)
      const configFile = resolve(temporary, 'firebase.json')
      await writeJson(configFile, { hosting: {
        ...config.hosting, site: config.site, public: resolve(this.root, '.output/public'),
      } })
      record.state = 'uploading'
      await writeJson(recordPath, record)
      await this.io.run(this.root, 'firebase', [
        'deploy', '--only', 'hosting', '--project', config.projectId, '--config', configFile, '--non-interactive',
      ])
      await this.verify(deployment)
      await unchanged(this.root, snapshot)
      record.state = 'verified'
      await writeJson(recordPath, record)
      return await this.track(record)
    } catch (error) {
      throw new Error(`${error instanceof Error ? error.message : error}\nInspect ${recordPath}. ` +
        `If upload succeeded, run: bun run ops -- deploy reconcile --id ${deployment.id}`)
    } finally {
      await rm(temporary, { recursive: true, force: true })
    }
  }

  async reconcile(id: string) {
    const record = await readJson(await this.recordPath(id)) as DeploymentRecord
    const config = await this.config()
    if (record.deployment.projectId !== config.projectId || record.deployment.site !== config.site) {
      throw new Error('Deployment belongs to a different Firebase project/site')
    }
    await this.verify(record.deployment)
    return this.track(record)
  }
}
