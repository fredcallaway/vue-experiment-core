#!/usr/bin/env bun
import { execFileSync } from 'node:child_process'
import { assertFirebaseProjectMatchesCli } from './firebase-project'

try {
  const projectId = await assertFirebaseProjectMatchesCli(process.cwd())
  execFileSync('bun', ['run', 'generate'], { stdio: 'inherit' })
  execFileSync('firebase', ['deploy', '--project', projectId], { stdio: 'inherit' })
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
