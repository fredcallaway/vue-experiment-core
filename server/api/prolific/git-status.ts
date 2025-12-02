import { execSync } from 'child_process'

export default defineEventHandler(async (event) => {
  try {
    // Check if git worktree is clean
    const fullGitStatusOutput = execSync('git status --porcelain', { encoding: 'utf-8' }).trim()
    const gitStatusOutput = fullGitStatusOutput
      .split('\n')
      .filter(line => !line.includes('core/pages/prolific'))
      .filter(line => !line.includes('core/server/api/prolific'))
      .join('\n')
      .trim()
    const sha = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim().substring(0, 8)
    return { sha, dirty: gitStatusOutput !== '', gitStatusOutput }
  } catch (error: any) {
    return {
      sha: 'unknown (git status failed)',
      dirty: true,
      gitStatusOutput: error.message,
    } 
  }
})
