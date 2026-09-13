#!/usr/bin/env bun
import { readFile } from 'node:fs/promises'
import { DraftOperations } from './drafts'
import { FirebaseRestDatabase } from './database'
import { MockProlificReader, ProlificHttpReader } from './prolific-reader'
import { ReviewOperations } from './review'
import { DeploymentOperations } from './deployment'
import { withOperationLock } from './project'

const args = process.argv.slice(2)
if (args[0] === '--') args.shift()

const option = (name: string) => {
  const index = args.indexOf(name)
  if (index === -1) return undefined
  const value = args[index + 1]
  if (!value) throw new Error(`Missing value for ${name}`)
  return value
}

const readJsonInput = async () => {
  const inline = option('--json')
  const file = option('--file')
  if (inline && file) throw new Error('Use only one of --json or --file')
  if (inline) return JSON.parse(inline)
  if (file) return JSON.parse(await readFile(file, 'utf8'))
  throw new Error('Provide JSON with --json or --file')
}

const usage = () => `Usage:
  bun run ops -- deploy inspect
  bun run ops -- deploy run
  bun run ops -- deploy reconcile --id <operation-id>
  bun run ops -- study-draft get
  bun run ops -- study-draft update --json '<patch>'
  bun run ops -- review-draft get --study <study-id>
  bun run ops -- review-draft update --study <study-id> --json '<patch>'
  bun run ops -- review inspect --study <study-id> [--submission <submission-id>] [--fixture <file>]
`

const main = async () => {
  if (args.length === 0 || args[0] === '--help') {
    console.log(usage())
    return
  }
  const [resource, action] = args
  if (!resource || !action) throw new Error(usage())

  const allowed: Record<string, string[]> = {
    'deploy inspect': [], 'deploy run': [], 'deploy reconcile': ['--id'],
    'study-draft get': [], 'study-draft update': ['--json', '--file'],
    'review-draft get': ['--study'], 'review-draft update': ['--study', '--json', '--file'],
    'review inspect': ['--study', '--submission', '--fixture'],
  }
  const flags = allowed[`${resource} ${action}`]
  if (!flags) throw new Error(usage())
  const seen = new Set<string>()
  for (let i = 2; i < args.length; i++) {
    const flag = args[i]!
    if (!flags.includes(flag) || seen.has(flag)) throw new Error(`Unknown or duplicate option: ${flag}`)
    seen.add(flag)
    if (!args[++i] || args[i]!.startsWith('--')) {
      throw new Error(`Missing value for ${flag}`)
    }
  }

  const database = await FirebaseRestDatabase.fromProject()
  const drafts = new DraftOperations(database)
  let result: unknown

  if (resource === 'deploy') {
    const deployments = new DeploymentOperations(process.cwd(), database)
    if (action === 'inspect') result = await deployments.inspect()
    else result = await withOperationLock(process.cwd(), () => action === 'run'
      ? deployments.deploy() : deployments.reconcile(option('--id') ?? ''))
  } else if (resource === 'study-draft' && action === 'get') {
    result = await drafts.getStudyDraft()
  } else if (resource === 'study-draft' && action === 'update') {
    result = await drafts.updateStudyDraft(await readJsonInput())
  } else if (resource === 'review-draft' && action === 'get') {
    result = await drafts.getReviewDraft(option('--study') ?? '')
  } else if (resource === 'review-draft' && action === 'update') {
    result = await drafts.updateReviewDraft(option('--study') ?? '', await readJsonInput())
  } else if (resource === 'review' && action === 'inspect') {
    const fixture = option('--fixture')
    const prolific = fixture
      ? MockProlificReader.fromFixture(JSON.parse(await readFile(fixture, 'utf8')))
      : await ProlificHttpReader.fromProject()
    const review = new ReviewOperations(database, prolific)
    result = await review.inspect(option('--study') ?? '', option('--submission'))
  } else {
    throw new Error(usage())
  }

  console.log(JSON.stringify(result, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
