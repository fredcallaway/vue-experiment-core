import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
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

  private async get(path: string): Promise<unknown> {
    const response = await fetch(`https://api.prolific.com/api/v1/${path.replace(/^\//, '')}`, {
      headers: {
        Authorization: `Token ${this.token}`,
        'Content-Type': 'application/json',
      },
    })
    if (!response.ok) throw new Error(`Prolific GET failed (${response.status}): ${await response.text()}`)
    return await response.json()
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
