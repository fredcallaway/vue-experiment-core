import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { firebaseEnvironment } from './firebase-auth'

type RunCommand = (command: string, args: string[]) => string

export async function assertFirebaseProjectMatchesCli(root: string, run?: RunCommand): Promise<string> {
  const configPath = resolve(root, 'firebase.config.json')
  const config = JSON.parse(await readFile(configPath, 'utf8'))
  const projectId = config.projectId
  if (typeof projectId !== 'string' || !projectId.trim()) {
    throw new Error(`Set a Firebase project ID in ${configPath} before deploying`)
  }

  const env = run ? undefined : await firebaseEnvironment(root)
  let activeProject: string
  try {
    const output = run
      ? run('firebase', ['use', '--json'])
      : execFileSync('firebase', ['use', '--json'], { cwd: root, env, encoding: 'utf8' })
    const selection = JSON.parse(output)
    if (selection.status !== 'success' || typeof selection.result !== 'string') throw new Error()
    activeProject = selection.result
  } catch {
    throw new Error('Select a Firebase CLI project with `firebase use` before deploying')
  }

  if (activeProject !== projectId) {
    throw new Error(
      `Firebase CLI project "${activeProject}" differs from firebase.config.json project "${projectId}". ` +
      'Update firebase.config.json for this experiment before deploying.'
    )
  }
  return projectId
}
