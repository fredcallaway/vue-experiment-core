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

    if (gitStatusOutput) {
      return {
        success: false, 
        sha,
        reason: 'dirty',
      }
    }

    // Run deploy command
    execSync('bun run generate', { stdio: 'inherit' })
    execSync('firebase deploy', { stdio: 'inherit' })
    
    return {
      success: true,
      sha,
    }
  } catch (error: any) {
    if (error.statusCode) {
      console.error('👉 unhandled error in deploy.ts')
      throw error
    }
    console.error('👉 unhandled error with statusCode:', error.statusCode, 'in deploy.ts', error)
    return {
      success: false, 
      reason: 'unknown error',
      error: error.message,
    }
  }
})
