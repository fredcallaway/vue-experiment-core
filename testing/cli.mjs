#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolve, join } from 'node:path'
import { executeTrace, loadBaseline, readJson, saveBaseline, writeJson } from './runner.mjs'
import { main as agentMain } from './agent/cli.mjs'

const help = `Experiment testing: inspect with an agent, compile reviewed evidence, replay quickly.

  bun core/testing/cli.mjs agent start --url http://localhost:3030/dev --seed test-1 --output /tmp/session
  bun core/testing/cli.mjs agent help
  bun core/testing/cli.mjs run trace.json --output /tmp/candidate
  bun core/testing/cli.mjs compile /tmp/candidate --reviewer tester --rationale "Reviewed all images and events" --output /tmp/baseline
  bun core/testing/cli.mjs test /tmp/baseline/baseline.json --output /tmp/replay
  bun core/testing/cli.mjs suite suite.json --section trial --jobs 2 --output /tmp/suite

run/test accept --project <repository> for source provenance. test/suite accept
--review-command '["path/to/testing-agent","argument"]' to dispatch failures automatically.
The process receives handoff JSON on stdin; its output is saved, never treated as baseline approval.
Suite JSON: {"baselines":["relative/path/baseline.json"]}. --section matches trace id or scope label.
Exit codes: 0 = passed/reviewable candidate, 2 = agent review needed, 1 = invalid input/tool failure.`

function options(args) {
  const result = {}
  for (let index = 0; index < args.length; index += 2) {
    if (!args[index].startsWith('--') || args[index + 1] === undefined) throw new Error('Expected --option value')
    const key = args[index].slice(2)
    if (key in result) throw new Error(`Repeated option ${key}`)
    if (!['output', 'reviewer', 'rationale', 'project', 'review-command', 'section', 'jobs'].includes(key)) {
      throw new Error(`Unknown option --${key}`)
    }
    result[key] = args[index + 1]
  }
  return result
}

export async function main(args = process.argv.slice(2)) {
  const [command, input, ...rest] = args
  if (!command || ['help', '--help'].includes(command)) return { help }
  if (command === 'agent') return agentMain(args.slice(1))
  if (!input || !['run', 'compile', 'test', 'suite'].includes(command)) throw new Error(help)
  const opts = options(rest)
  const outputDir = resolve(opts.output || `.experiment-tests/${command}-${Date.now()}`)
  const common = { outputDir, project: opts.project,
    reviewCommand: opts['review-command'] && JSON.parse(opts['review-command']) }
  if (command === 'compile') {
    return saveBaseline({
      trace: await readJson(join(input, 'trace.json')), run: await readJson(join(input, 'run.json')),
      approval: { reviewer: opts.reviewer, rationale: opts.rationale }, outputDir,
    })
  }
  if (command === 'run') return summarize(await executeTrace({ ...common, trace: await readJson(input) }))
  if (command === 'test') {
    const baseline = await loadBaseline(resolve(input))
    return summarize(await executeTrace({ ...common, trace: baseline.trace, baseline }))
  }
  const suitePath = resolve(input)
  const suite = await readJson(suitePath)
  if (!Array.isArray(suite.baselines) || !suite.baselines.length) throw new Error('suite.baselines must be nonempty')
  const baselines = await Promise.all(suite.baselines.map(path => loadBaseline(resolve(suitePath, '..', path))))
  const selected = baselines.filter(item => !opts.section || item.trace.id.includes(opts.section)
    || item.trace.scope.label.includes(opts.section) || item.trace.scope.kind === opts.section)
  if (!selected.length) throw new Error('No tests match the section filter')
  if (new Set(selected.map(item => item.id)).size !== selected.length) throw new Error('Suite trace ids must be unique')
  const jobs = Number(opts.jobs || 2)
  if (!Number.isInteger(jobs) || jobs < 1 || jobs > 8) throw new Error('--jobs must be between 1 and 8')
  let next = 0
  const results = []
  await Promise.all(Array.from({ length: Math.min(jobs, selected.length) }, async () => {
    while (next < selected.length) {
      const baseline = selected[next++]
      results.push(summarize(await executeTrace({ ...common, baseline, trace: baseline.trace,
        outputDir: join(outputDir, baseline.id) })))
    }
  }))
  const summary = { status: results.every(run => run.status === 'passed') ? 'passed' : 'needs-agent-review', results }
  await writeJson(join(outputDir, 'suite.json'), summary)
  return summary
}

function summarize(run) {
  return { status: run.status, traceId: run.traceId, elapsedMs: run.elapsedMs, steps: run.steps.length,
    checkpoints: run.checkpoints.length, failures: run.failures, reportPath: run.reportPath,
    ...(run.agentReview && { agentReview: run.agentReview.status }) }
}

if (import.meta.main || import.meta.url === pathToFileURL(resolve(process.argv[1] || '')).href) {
  // Playwright's browser transport requires Node; older Bun releases corrupt concurrent transport lifecycles.
  if (process.versions.bun) {
    const child = spawnSync('node', [fileURLToPath(import.meta.url), ...process.argv.slice(2)], { stdio: 'inherit' })
    if (child.error) throw child.error
    process.exit(child.status ?? 1)
  }
  main().then(result => {
    console.log(result.help || JSON.stringify(result, null, 2))
    if (result.status === 'needs-agent-review') process.exitCode = 2
  }).catch(error => {
    console.error(JSON.stringify({ error: error.message }))
    process.exitCode = 1
  })
}
