import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { ActiveProlificStudy } from '../internal/deploymentSafety'
import {
  ProlificStudyDetailsSchema,
  ProlificStudyFullSchema,
  ProlificSubmissionSchema,
  type StudyFull,
} from '../internal/prolific'

export interface ProlificReader {
  getStudy(studyId: string): Promise<StudyFull>
}

export class ProlificHttpReader implements ProlificReader {
  constructor(private readonly token: string) {}

  static async fromProject(projectRoot = process.cwd()) {
    const token = (await readFile(resolve(projectRoot, '.prolific_token'), 'utf8')).trim()
    if (!token) throw new Error('The Prolific token is empty')
    return new ProlificHttpReader(token)
  }

  private async get(path: string, signal?: AbortSignal): Promise<unknown> {
    const response = await fetch(`https://api.prolific.com/api/v1/${path.replace(/^\//, '')}`, {
      headers: {
        Authorization: `Token ${this.token}`,
        'Content-Type': 'application/json',
      },
      signal,
    })
    if (!response.ok) throw new Error(`Prolific GET failed (${response.status}): ${await response.text()}`)
    return await response.json()
  }

  async getActiveStudies(projectId: string): Promise<ActiveProlificStudy[]> {
    const pageSize = 50
    const studies: ActiveProlificStudy[] = []
    for (let page = 1; ; page++) {
      const query = new URLSearchParams({ status: 'ACTIVE', page: String(page), page_size: String(pageSize) })
      const path = `projects/${encodeURIComponent(projectId)}/studies/?${query}`
      const response = await this.get(path, AbortSignal.timeout(10_000)) as {
        results?: { id: string, name: string, internal_name?: string, status: string }[]
        meta?: { count?: number }
        _links?: { next?: { href?: string } }
      }
      if (!Array.isArray(response.results)) throw new Error('Invalid Prolific study list')
      for (const study of response.results) {
        if (!study || typeof study.status !== 'string') throw new Error('Missing Prolific study status')
        if (study.status !== 'ACTIVE') continue
        if (typeof study.id !== 'string' || !study.id) throw new Error('Missing active Prolific study ID')
        studies.push({ id: study.id, name: study.internal_name || study.name || study.id })
      }
      const count = response.meta?.count
      if (response.results.length === 0) break
      if (typeof count === 'number' ? page * pageSize >= count
        : !response._links?.next?.href && response.results.length < pageSize) break
    }
    return studies
  }

  async getStudy(studyId: string): Promise<StudyFull> {
    const [studyResponse, submissionsResponse] = await Promise.all([
      this.get(`studies/${studyId}/`),
      this.get(`studies/${studyId}/submissions/`),
    ])
    const study = ProlificStudyDetailsSchema.parse(studyResponse)
    const submissions = (submissionsResponse as { results?: unknown[] }).results ?? []
    return {
      ...study,
      submissions: submissions.map(submission => ProlificSubmissionSchema.parse(submission)),
    }
  }
}

export class MockProlificReader implements ProlificReader {
  readonly calls: string[] = []

  constructor(private readonly studies: Record<string, StudyFull>) {}

  static fromFixture(input: unknown) {
    const study = ProlificStudyFullSchema.parse(input)
    return new MockProlificReader({ [study.id]: study })
  }

  async getStudy(studyId: string): Promise<StudyFull> {
    this.calls.push(studyId)
    const study = this.studies[studyId]
    if (!study) throw new Error(`Mock study not found: ${studyId}`)
    return structuredClone(study)
  }
}
