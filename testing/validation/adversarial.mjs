import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { safeBrowser, testUrl } from '../browser.mjs'
import { createAgentSession } from '../agent/session.mjs'
import { compileRun, runTrace, validateTrace } from '../replay/index.mjs'
import { main as testingCli } from '../cli.mjs'

// Independent fault injection against the public APIs. No participant service is contacted.
const output = await mkdtemp(join(tmpdir(), 'experiment-adversarial-'))
let fault = 'none'
const fixture = () => `<!doctype html><html><head><style>
  body { margin: 0; font: 16px Arial; background: white }
  main { box-sizing: border-box; margin: 80px 20px; width: 600px; min-height: 240px; padding: 24px }
  button { font: inherit; padding: 12px }
  #outside { position: fixed; top: 10px; left: 20px; color: ${fault === 'outside-root' ? 'white' : 'black'} }
  ${fault === 'offscreen' ? 'main { position: fixed; left: -900px }' : ''}
  ${fault === 'clipped' ? '#instructions { height: 8px; overflow: hidden }' : ''}
  ${fault === 'animation' ? '@keyframes pulse { to { background: red } }' : ''}
  ${fault === 'animation' ? 'main { animation: pulse 1s infinite alternate }' : ''}
  </style></head><body><p id="outside">Critical instruction outside the root</p><main><div id="all">
  <h1>Choose left</h1><p id="instructions">Read the whole instruction before responding.</p>
  <button id="choose">Left</button><p id="result">Waiting</p>
  <div id="swatch" style="width:80px;height:80px;background:rgb(255,${fault === 'stimulus-color' ? 20 : 0},0)"></div>
  </div></main><script>
  document.querySelector('#choose').onclick = () => {
    if (${JSON.stringify(fault)} === 'noop') return;
    document.querySelector('#result').textContent = 'Finished';
    if (${JSON.stringify(fault)} === 'finish-visual') document.querySelector('#result').style.color = 'white';
    if (${JSON.stringify(fault)} !== 'missing-event') console.debug('logEvent', 'trial.choice', {
      choice: ${fault === 'wrong-event' ? '"right"' : '"left"'}, correct: ${fault !== 'wrong-event'}
    });
  };
  </script></body></html>`
const server = createServer((request, response) => {
  response.writeHead(200, { 'content-type': 'text/html' })
  response.end(fixture())
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const url = `http://127.0.0.1:${server.address().port}/dev`
const viewport = { width: 900, height: 650 }
const target = { role: 'button', name: 'Left' }
const finished = { kind: 'text', target: { css: '#result' }, value: 'Finished' }
const event = { kind: 'event', name: 'trial.choice', where: { choice: 'left', correct: true } }
const approval = { reviewer: 'adversarial-fixture', rationale: 'Known deterministic fixture for fault injection only' }
const results = []

async function check(name, fn) {
  const started = performance.now()
  try {
    const evidence = await fn()
    results.push({ name, passed: true, elapsedMs: Math.round(performance.now() - started), evidence })
  } catch (error) {
    results.push({ name, passed: false, elapsedMs: Math.round(performance.now() - started), error: error.message })
  }
}

async function withSession(name, fn) {
  const runtime = await safeBrowser({ url, viewport })
  try {
    await runtime.page.goto(runtime.url, { waitUntil: 'load' })
    const session = await createAgentSession({ id: name, url, viewport, rootSelector: 'main',
      output: join(output, name) }, runtime)
    return await fn(session, runtime)
  } finally {
    await runtime.close()
  }
}

async function replay(name, trace, baseline) {
  const runtime = await safeBrowser({ url, viewport })
  try {
    return await runTrace({ page: runtime.page, trace, baseline, outputDir: join(output, name),
      readEvents: runtime.readEvents,
      captureExtras: async () => ({ events: await runtime.readEvents() }),
      provenance: { browserVersion: runtime.browser.version(), fixture: true } })
  } finally {
    await runtime.close()
  }
}

try {
  fault = 'none'
  await check('healthy-agent-record-compile', () => withSession('healthy', async session => {
    await session.checkpoint({ name: 'instructions' })
    await session.act({ action: 'click', target })
    await session.checkpoint({ name: 'finished', assertions: [finished, event] })
    const handoff = await session.finish({ summary: 'Reached explicit terminal state and expected data',
      terminal: [finished, event] })
    assert.equal(handoff.status, 'candidate')
    const compiled = await session.compile(approval)
    assert(compiled.baselinePath)
    return compiled
  }))
  fault = 'noop'
  await check('noop-action-is-rejected', () => withSession('noop', async session => {
    await assert.rejects(session.act({ action: 'click', target }), /no observable/)
    return { rejected: true }
  }))
  fault = 'none'
  await check('early-failure-produces-handoff', () => withSession('early-failure', async session => {
    const handoff = await session.finish({ passed: false, summary: 'Instructions do not match protocol' })
    assert.equal(handoff.status, 'failed')
    assert.equal(JSON.parse(await readFile(handoff.handoffPath, 'utf8')).status, 'failed')
    await assert.rejects(session.compile(approval))
    return { handoffPath: handoff.handoffPath }
  }))
  fault = 'clipped'
  await check('initially-broken-layout-cannot-compile', () => withSession('clipped', async session => {
    await session.checkpoint({ name: 'instructions' }).catch(() => {})
    const handoff = await session.finish({ summary: 'Intentionally clipped initial fixture',
      terminal: [{ kind: 'visible', target }] })
    assert.equal(handoff.status, 'failed')
    await assert.rejects(session.compile(approval))
    return { failures: handoff.failures }
  }))

  const trace = { version: 1, id: 'fault-probe', startUrl: url, viewport, rootSelector: 'main',
    scope: { kind: 'section', label: 'One deterministic choice' }, steps: [
      { action: 'click', target },
      { action: 'checkpoint', name: 'finished', assertions: [finished, event], timeoutMs: 200 },
    ], completion: [finished, event] }
  fault = 'none'
  const candidate = await replay('candidate', trace)
  await check('healthy-replay-is-candidate', () => {
    assert.equal(candidate.status, 'candidate')
    return candidate.reportPath
  })
  const baseline = await compileRun({ trace, run: candidate, approval })
  await check('unchanged-replay-passes', async () => {
    const run = await replay('unchanged', trace, baseline)
    assert.equal(run.status, 'passed')
    return run.reportPath
  })
  for (const mode of ['missing-event', 'wrong-event', 'outside-root', 'stimulus-color']) {
    fault = mode
    await check(`${mode}-does-not-pass`, async () => {
      const run = await replay(mode, trace, baseline)
      assert.equal(run.status, 'needs-agent-review', `${mode} falsely passed`)
      assert(run.failures.some(failure => ['outside-root', 'stimulus-color'].includes(mode)
        ? failure.kind === 'visual' : failure.message.includes('event trial.choice')),
      'Failure must establish the injected defect, not an unrelated browser error')
      return { failures: run.failures, reportPath: run.reportPath }
    })
  }
  fault = 'animation'
  await check('animated-state-does-not-silently-stabilize', async () => {
    const run = await replay('animation', trace, baseline)
    assert.equal(run.status, 'needs-agent-review')
    assert(run.failures.some(failure => failure.message.includes('did not stabilize')))
    return { failures: run.failures }
  })
  await check('malformed-trace-rejected', () => {
    for (const malformed of [
      { ...trace, completion: [] }, { ...trace, steps: [] },
      { ...trace, steps: [{ action: 'evaluate', value: 'true' }] },
      { ...trace, steps: [{ action: 'checkpoint', name: '../../escape' }] },
    ]) assert.throws(() => validateTrace(malformed))
    return { rejected: 4 }
  })
  await check('unapproved-baseline-rejected', async () => {
    await assert.rejects(async () => compileRun({ trace, run: candidate }))
    return { rejected: true }
  })
  await check('terminal-visual-change-cannot-escape-earlier-checkpoint', async () => {
    const uncovered = { ...trace, id: 'uncovered-terminal', steps: [
      { action: 'checkpoint', name: 'initial', assertions: [{ kind: 'visible', target }] },
      { action: 'click', target },
    ] }
    try { validateTrace(uncovered) } catch (error) { return { rejectedTrace: error.message } }
    fault = 'none'
    const initial = await replay('uncovered-candidate', uncovered)
    const approved = await compileRun({ trace: uncovered, run: initial, approval })
    fault = 'finish-visual'
    const run = await replay('uncovered-replay', uncovered, approved)
    assert.equal(run.status, 'needs-agent-review', 'Final visual changed but only an earlier checkpoint was compared')
    assert(run.failures.some(failure => ['visual', 'structure', 'layout'].includes(failure.kind)))
    return { failures: run.failures }
  })
  fault = 'none'
  for (const selector of ['main', '#all', '#absent']) {
    await check(`unsafe-mask-${selector}-rejected`, async () => {
      const masked = structuredClone(trace)
      masked.steps.at(-1).masks = [{ selector, reason: 'Intentional adversarial blanket or invalid mask' }]
      const run = await replay(`mask-${selector.slice(1)}`, masked)
      assert.equal(run.status, 'needs-agent-review', `Mask ${selector} hides too much or is invalid but compiled`)
      assert(run.failures.some(failure => /mask/i.test(failure.message)))
      return { failures: run.failures }
    })
  }
  await check('unsafe-local-paths-rejected', () => {
    const paths = ['/exp', '/%65xp', '/api/deploy', '/dev/../data', '/dev%2f..%2fexp',
      '/examples/%2e%2e%2fexp', '/examples/%2e%2e%2fapi/deploy']
    for (const path of paths) {
      assert.throws(() => testUrl(new URL(path, url).href), `Unsafe route ${path} accepted`)
    }
    return { rejected: paths.length }
  })
  fault = 'none'
  const cliTracePath = join(output, 'cli-trace.json')
  await writeFile(cliTracePath, JSON.stringify(trace))
  await check('assembled-cli-run-compile-test', async () => {
    const candidateDir = join(output, 'cli-candidate')
    const compiledDir = join(output, 'cli-baseline')
    const initial = await testingCli(['run', cliTracePath, '--output', candidateDir])
    assert.equal(initial.status, 'candidate')
    const compiled = await testingCli(['compile', candidateDir, '--reviewer', approval.reviewer,
      '--rationale', approval.rationale, '--output', compiledDir])
    const run = await testingCli(['test', compiled.path, '--output', join(output, 'cli-replay')])
    assert.equal(run.status, 'passed')
    return run
  })
  await check('review-process-runs-once-only-after-failure', async () => {
    const hook = join(output, 'review-hook.mjs')
    const log = join(output, 'review-calls.jsonl')
    await writeFile(hook, `import { appendFileSync } from 'node:fs';
      let input = ''; for await (const chunk of process.stdin) input += chunk;
      const handoff = JSON.parse(input);
      appendFileSync(process.argv[2], JSON.stringify(handoff) + '\\n');
      console.log(JSON.stringify({ classified: 'fixture-defect', traceId: handoff.traceId }));`)
    const argv = JSON.stringify([process.execPath, hook, log])
    const baselinePath = join(output, 'cli-baseline', 'baseline.json')
    fault = 'none'
    const clean = await testingCli(['test', baselinePath, '--output', join(output, 'cli-hook-clean'),
      '--review-command', argv])
    assert.equal(clean.status, 'passed')
    await assert.rejects(readFile(log), error => error.code === 'ENOENT')
    fault = 'wrong-event'
    const failed = await testingCli(['test', baselinePath, '--output', join(output, 'cli-hook-failed'),
      '--review-command', argv])
    assert.equal(failed.status, 'needs-agent-review')
    assert.equal(failed.agentReview, 'completed')
    const calls = (await readFile(log, 'utf8')).trim().split('\n').map(line => JSON.parse(line))
    assert.equal(calls.length, 1)
    assert.equal(calls[0].traceId, trace.id)
    assert(calls[0].failures.length)
    return { calls: calls.length, failureRemains: failed.status, handoff: calls[0] }
  })
} finally {
  await new Promise(resolve => server.close(resolve))
  const report = { output, checks: results.length, failures: results.filter(result => !result.passed).length, results }
  await writeFile(join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify(report, null, 2))
  process.exitCode = report.failures ? 1 : 0
}
