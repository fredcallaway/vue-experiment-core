import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { captureCheckpoint, compareCheckpoint } from './checkpoint.mjs'
import { assertExpectations, canonical, digest, executeStep, validateTrace } from './trace.mjs'

export { captureCheckpoint, compareCheckpoint } from './checkpoint.mjs'
export { assertExpectations, digest, executeStep, resolveTarget, validateExpectations, validateStep, validateTrace } from './trace.mjs'
export const traceHash = trace => digest(validateTrace(trace))

function validateRun(trace, run) {
  if (run.traceHash !== traceHash(trace)) throw new Error('Run does not belong to this exact trace')
  if (run.status !== 'candidate' || !run.completed || run.failures.length) throw new Error('Only complete clean candidates can compile')
  if (!run.provenance || typeof run.provenance !== 'object' || Array.isArray(run.provenance)) {
    throw new Error('Compilation requires run provenance')
  }
  canonical(run.provenance)
  const names = trace.steps.filter(step => step.action === 'checkpoint').map(step => step.name)
  if (canonical(names) !== canonical(run.checkpoints.map(checkpoint => checkpoint.name))) {
    throw new Error('Run must include every checkpoint in trace order')
  }
  if (run.steps.length !== trace.steps.length
    || run.steps.some((step, index) => step.stepHash !== digest(trace.steps[index]))) {
    throw new Error('Run must include receipts for every recorded action in order')
  }
  for (const checkpoint of run.checkpoints) {
    if (digest(checkpoint.structure) !== checkpoint.structureHash || !checkpoint.screenshotHash || !checkpoint.screenshotPath) {
      throw new Error('Checkpoint evidence is incomplete or modified')
    }
    if (!checkpoint.layout || checkpoint.layout.findings.some(finding => finding.severity === 'error')) {
      throw new Error('Checkpoint requires a completed layout audit without errors')
    }
    if (digest(readFileSync(checkpoint.screenshotPath)) !== checkpoint.screenshotHash) {
      throw new Error('Checkpoint screenshot bytes changed after capture')
    }
  }
}

export function compileRun({ trace, run, approval }) {
  validateTrace(trace)
  validateRun(trace, run)
  if (!approval || typeof approval.reviewer !== 'string' || !approval.reviewer.trim()
    || typeof approval.rationale !== 'string' || !approval.rationale.trim()) {
    throw new Error('Explicit reviewer identity and review rationale are required to adopt a visual baseline')
  }
  return {
    version: 1, id: trace.id, traceHash: traceHash(trace),
    candidateRunId: run.id, candidateDigest: digest(run),
    approvedAt: new Date().toISOString(), approval: { reviewer: approval.reviewer, rationale: approval.rationale },
    provenance: run.provenance, checkpoints: run.checkpoints,
  }
}

function validateBaseline(baseline, trace) {
  if (baseline?.version !== 1 || baseline.id !== trace.id || baseline.traceHash !== traceHash(trace)) {
    throw new Error('Baseline does not match this trace; agent review is required')
  }
  if (!baseline.approval?.reviewer || !baseline.approval?.rationale || !baseline.candidateDigest) {
    throw new Error('Baseline does not contain explicit review provenance')
  }
  const names = trace.steps.filter(step => step.action === 'checkpoint').map(step => step.name)
  if (!Array.isArray(baseline.checkpoints)
    || canonical(names) !== canonical(baseline.checkpoints.map(checkpoint => checkpoint.name))) {
    throw new Error('Baseline checkpoint coverage differs from the trace')
  }
}

export async function runTrace({
  page, trace, baseline, outputDir, provenance = {}, readEvents, captureExtras, onCheckpoint, comparison = {},
}) {
  validateTrace(trace)
  if (!outputDir) throw new Error('runTrace requires outputDir')
  const started = performance.now()
  const run = {
    version: 1, id: randomUUID(), traceId: trace.id, traceHash: traceHash(trace),
    status: 'candidate', completed: false, provenance,
    startedAt: new Date().toISOString(), steps: [], checkpoints: [], comparisons: [], failures: [],
  }
  const browserErrors = []
  const onPageError = error => browserErrors.push({ kind: 'page-error', message: error.message })
  const onConsole = message => {
    if (message.type() === 'error' && !message.text().includes('net::ERR_BLOCKED_BY_CLIENT')) {
      browserErrors.push({ kind: 'console-error', message: message.text() })
    }
  }
  page.on('pageerror', onPageError)
  page.on('console', onConsole)
  await mkdir(outputDir, { recursive: true })
  let currentStep = -1
  try {
    if (baseline) {
      validateBaseline(baseline, trace)
      const destination = `${resolve(outputDir)}${sep}`
      if (baseline.checkpoints.some(checkpoint => resolve(checkpoint.screenshotPath).startsWith(destination))) {
        throw new Error('Replay output directory would overwrite reviewed baseline evidence')
      }
      if (canonical(provenance.environment ?? {}) !== canonical(baseline.provenance?.environment ?? {})) {
        throw new Error('Browser or run environment changed; agent review is required')
      }
    }
    await page.setViewportSize(trace.viewport)
    await page.goto(trace.startUrl, { waitUntil: 'domcontentloaded' })
    for (const [index, step] of trace.steps.entries()) {
      currentStep = index
      const stepStarted = performance.now()
      const startedAt = new Date().toISOString()
      if (step.action === 'checkpoint') {
        if (index === trace.steps.length - 1) await assertExpectations(page, trace.completion, { readEvents })
        const checkpoint = await captureCheckpoint(page, step, {
          outputDir, rootSelector: trace.rootSelector, readEvents, captureExtras,
        })
        run.checkpoints.push(checkpoint)
        run.failures.push(...checkpoint.layout.findings.filter(finding => finding.severity === 'error')
          .map(finding => ({ kind: 'layout', checkpoint: step.name, step: index, ...finding })))
        if (onCheckpoint) await onCheckpoint(checkpoint, { page, step, run })
        if (baseline) {
          const expected = baseline.checkpoints.find(item => item.name === step.name)
          const result = await compareCheckpoint(checkpoint, expected, { outputDir, ...comparison })
          run.comparisons.push(result)
          run.failures.push(...result.failures.map(failure => ({ ...failure, checkpoint: step.name, step: index })))
        }
        run.steps.push({ action: step.action, stepHash: digest(step), startedAt,
          elapsedMs: Math.round(performance.now() - stepStarted) })
      } else {
        const receipt = await executeStep(page, step, { readEvents })
        run.steps.push({ ...receipt, stepHash: digest(step) })
      }
    }
    await assertExpectations(page, trace.completion, { readEvents })
    run.completed = true
    if (readEvents) {
      const events = await readEvents()
      run.failures.push(...events.filter(event => event.eventType === 'error')
        .map(event => ({ kind: 'experiment-error', message: JSON.stringify(event.data) })))
    }
  } catch (error) {
    run.failures.push({ kind: 'execution', step: currentStep, message: error instanceof Error ? error.message : String(error) })
  } finally {
    page.off('pageerror', onPageError)
    page.off('console', onConsole)
  }
  run.failures.push(...browserErrors)
  run.status = run.failures.length ? 'needs-agent-review' : baseline ? 'passed' : 'candidate'
  run.finishedAt = new Date().toISOString()
  run.elapsedMs = Math.round(performance.now() - started)
  if (run.status === 'needs-agent-review') {
    run.handoff = {
      version: 1, kind: 'experiment-test-review', runId: run.id, traceId: trace.id,
      reason: 'Mechanical replay failed. Inspect actual screenshots, diffs, actions, and semantic state before changing code or baseline.',
      instructions: [
        'Reproduce the failure with the recorded seed, viewport, and condition.',
        'Inspect the participant screenshot and expected behavior; classify defect, intended change, or unstable fixture.',
        'If this is a defect, report a minimal reproduction to the implementing agent and rerun after its fix.',
        'Adopt a replacement baseline only after explicit review of a new complete candidate run.',
      ],
      failures: run.failures,
      artifacts: run.checkpoints.map(checkpoint => ({ name: checkpoint.name, screenshotPath: checkpoint.screenshotPath })),
    }
    await writeFile(join(outputDir, 'handoff.json'), `${JSON.stringify(run.handoff, null, 2)}\n`)
  }
  run.reportPath = resolve(join(outputDir, 'run.json'))
  await writeFile(run.reportPath, `${JSON.stringify(run, null, 2)}\n`)
  return run
}
