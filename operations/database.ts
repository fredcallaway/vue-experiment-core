import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

type JsonObject = Record<string, unknown>

export interface OperationsDatabase {
  get<T>(path: string): Promise<T | null>
  update(path: string, updates: JsonObject): Promise<void>
}

type FirebaseConfig = {
  databaseURL: string
}

const encodePath = (path: string) => path
  .split('/')
  .filter(Boolean)
  .map(encodeURIComponent)
  .join('/')

export class FirebaseRestDatabase implements OperationsDatabase {
  constructor(private readonly databaseUrl: string) {}

  static async fromProject(projectRoot = process.cwd()) {
    const configPath = resolve(projectRoot, 'firebase.config.json')
    const config = JSON.parse(await readFile(configPath, 'utf8')) as FirebaseConfig
    if (!config.databaseURL) throw new Error(`Missing databaseURL in ${configPath}`)
    return new FirebaseRestDatabase(config.databaseURL)
  }

  private url(path: string) {
    return `${this.databaseUrl.replace(/\/$/, '')}/${encodePath(path)}.json`
  }

  async get<T>(path: string): Promise<T | null> {
    const response = await fetch(this.url(path))
    if (!response.ok) throw new Error(`Firebase GET failed (${response.status}): ${await response.text()}`)
    return await response.json() as T | null
  }

  async update(path: string, updates: JsonObject): Promise<void> {
    const response = await fetch(this.url(path), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    if (!response.ok) throw new Error(`Firebase PATCH failed (${response.status}): ${await response.text()}`)
  }
}
