import { execFileSync, spawn } from 'node:child_process'
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { safeBrowser, testUrl } from './browser.mjs'
import { compileRun, digest, runTrace, validateTrace } from './replay/index.mjs'

export const readJson = async path => JSON.parse(await readFile(path, 'utf8'))
export async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`)
}

export function sourceProvenance(project = process.cwd()) {
  const git = (cwd, args) => {
    try { return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() }
    catch { return null }
  }
  return {
    project: resolve(project),
    revision: git(project, ['rev-parse', 'HEAD']),
    coreRevision: git(join(project, 'core'), ['rev-parse', 'HEAD']),
    changes: git(project, ['status', '--short']),
    coreChanges: git(join(project, 'core'), ['status', '--short']),
  }
}

export async function loadBaseline(path) {
  const baseline = await readJson(path)
  return {
    ...baseline,
    checkpoints: baseline.checkpoints.map(checkpoint => ({
      ...checkpoint, screenshotPath: resolve(dirname(path), checkpoint.screenshotPath),
    })),
  }
}

/** Compile only reviewed evidence; keep screenshots beside the JSON so the bundle can be moved. */
export async function saveBaseline({ trace, run, approval, outputDir }) {
  const baseline = compileRun({ trace, run, approval })
  await mkdir(join(outputDir, 'images'), { recursive: true })
  for (const checkpoint of baseline.checkpoints) {
    const bytes = await readFile(checkpoint.screenshotPath)
    if (digest(bytes) !== checkpoint.screenshotHash) throw new Error(`Modified screenshot: ${checkpoint.name}`)
  }
  const checkpoints = []
  for (const checkpoint of baseline.checkpoints) {
    const screenshotPath = `images/${checkpoint.name}.png`
    await copyFile(checkpoint.screenshotPath, join(outputDir, screenshotPath))
    checkpoints.push({ ...checkpoint, screenshotPath })
  }
  const path = resolve(outputDir, 'baseline.json')
  await writeJson(path, { ...baseline, trace, checkpoints })
  return { path, checkpoints: checkpoints.length, status: 'compiled' }
}

export async function executeTrace({ trace: input, baseline, outputDir, project, reviewCommand }) {
  const trace = structuredClone(input)
  trace.startUrl = testUrl(trace.startUrl, trace.runtime)
  validateTrace(trace)
  await mkdir(outputDir, { recursive: true })
  await writeJson(join(outputDir, 'trace.json'), trace)
  const runtime = await safeBrowser({ url: trace.startUrl, viewport: trace.viewport, ...trace.runtime })
  let run
  try {
    run = await runTrace({
      page: runtime.page, trace, baseline, outputDir,
      provenance: {
        source: sourceProvenance(project),
        environment: { browser: runtime.browser.version(), platform: process.platform, arch: process.arch,
          viewport: trace.viewport, deviceScaleFactor: 1, fast: trace.runtime?.fast ?? false },
      },
      readEvents: runtime.readEvents,
      captureExtras: async () => {
        const state = await runtime.readState()
        return { source: state.source, ...(state.epoch && { epoch: state.epoch }), errors: state.errors }
      },
    })
    const state = await runtime.readState()
    run.diagnostics = state
    for (const error of state.errors) {
      if (!run.failures.some(failure => failure.message === error.message)) run.failures.push(error)
    }
    if (state.events.some(event => event.eventType === 'error') && !run.failures.length) {
      run.failures.push({ kind: 'experiment-error', message: 'The experiment logged an error event.' })
    }
    if (run.failures.length) run.status = 'needs-agent-review'
    if (run.status === 'needs-agent-review') {
      const screenshotPath = resolve(outputDir, 'failure.png')
      await runtime.page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {})
      run.handoff = {
        ...run.handoff, version: 1, kind: 'experiment-test-review', traceId: trace.id,
        tracePath: resolve(outputDir, 'trace.json'), runPath: resolve(outputDir, 'run.json'), screenshotPath,
        failures: run.failures,
        instruction: 'Investigate the actual participant view and event data. '
          + 'Report a defect, intended change, or inconclusive result. '
          + 'Do not replace the baseline without reviewing a fresh complete run.',
      }
      await writeJson(join(outputDir, 'handoff.json'), run.handoff)
    }
    await writeJson(join(outputDir, 'run.json'), run)
  } finally { await runtime.close() }
  if (run.status === 'needs-agent-review' && reviewCommand) {
    run.agentReview = await dispatchReview(reviewCommand, run.handoff, outputDir)
    await writeJson(join(outputDir, 'run.json'), run)
  }
  return run
}

/** A caller-supplied agent process receives evidence on stdin. No shell expansion or implicit model billing. */
export async function dispatchReview(command, handoff, outputDir, timeoutMs = 300_000) {
  if (!Array.isArray(command) || !command.length || command.some(value => typeof value !== 'string' || !value)) {
    throw new Error('reviewCommand must be a nonempty argv array')
  }
  const result = await new Promise(resolveResult => {
    const child = spawn(command[0], command.slice(1), { stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    let killTimer
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
      killTimer = setTimeout(() => child.kill('SIGKILL'), 1000)
    }, timeoutMs)
    child.stdout.on('data', chunk => { stdout = (stdout + chunk).slice(-1_000_000) })
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-1_000_000) })
    child.stdin.on('error', () => {})
    child.on('error', error => {
      clearTimeout(timer)
      clearTimeout(killTimer)
      resolveResult({ status: 'failed', error: error.message })
    })
    child.on('close', code => {
      clearTimeout(timer)
      clearTimeout(killTimer)
      resolveResult({ status: timedOut ? 'timeout' : code === 0 ? 'completed' : 'failed', code, stdout, stderr })
    })
    child.stdin.end(`${JSON.stringify(handoff)}\n`)
  })
  await writeJson(join(outputDir, 'agent-review.json'), result)
  return result
}
