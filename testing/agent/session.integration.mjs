import { afterEach, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { agentCommand, startAgentSession } from './client.mjs'
import { executeTrace, loadBaseline } from '../runner.mjs'
import { main } from './cli.mjs'

describe('persistent testing-agent sessions', { timeout: 30_000 }, () => {
  let server
  let url
  let output
  let sessions = []

  beforeEach(async () => {
    sessions = []
    output = await mkdtemp(join(tmpdir(), 'experiment-agent-tests-'))
    server = createServer((request, response) => {
      response.writeHead(200, { 'content-type': 'text/html' })
      response.end(`<!doctype html><html><body><main style="width:600px;padding:30px">
        <h1>Choose a color</h1><button id="answer">Blue</button><button id="inert">Inert</button>
        ${request.url.includes('offscreen') ? '<button style="position:absolute;left:-200px">Unreachable</button>' : ''}
        <script>document.querySelector('#inert').onclick = () => console.debug('logEvent', 'participant.click', {});
        document.querySelector('#answer').onclick = () => {
          console.debug('logEvent', 'trial.choice', { choice: 'blue' });
          document.querySelector('main').innerHTML = '<h1>Finished</h1><p>Recorded blue</p><textarea aria-label="Comment"></textarea>';
        }</script></main></body></html>`)
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    url = `http://127.0.0.1:${server.address().port}/dev`
  })

  afterEach(async () => {
    await Promise.all(sessions.map(path => agentCommand(path, 'stop').catch(() => {})))
    await new Promise(resolve => server.close(resolve))
  })

  async function start(name, options = {}) {
    const result = await startAgentSession({
      url, rootSelector: 'main', output: join(output, name), scope: { kind: 'full', label: 'One-choice fixture' },
      ...options,
    })
    sessions.push(result.sessionPath)
    return result
  }

  test('records real interaction, validates terminal events, and requires explicit review to compile', async () => {
    const { sessionPath, observation } = await start('clean')
    assert.ok(observation.accessibility.includes('Choose a color'))
    await agentCommand(sessionPath, 'checkpoint', { name: 'choice' })
    const result = await agentCommand(sessionPath, 'act', { action: 'click', target: { role: 'button', name: 'Blue' } })
    assert.equal(result.receipt.observedEffect, true)
    assert.ok(result.observation.accessibility.includes('Finished'))
    await agentCommand(sessionPath, 'act', { action: 'fill', target: { label: 'Comment' }, value: 'The color was blue' })
    await agentCommand(sessionPath, 'checkpoint', { name: 'completed' })
    await assert.rejects(agentCommand(sessionPath, 'finish', { summary: 'No terminal assertion' }), /terminal/)
    const handoff = await agentCommand(sessionPath, 'finish', {
      summary: 'Blue choice completed', terminal: [
        { kind: 'text', target: { css: 'h1' }, value: 'Finished' },
        { kind: 'event', name: 'trial.choice', where: { choice: 'blue' } },
      ],
    })
    assert.equal(handoff.status, 'candidate')
    await assert.rejects(agentCommand(sessionPath, 'compile'), /reviewer/)
    const compiled = await agentCommand(sessionPath, 'compile', {
      reviewer: 'integration-fixture', rationale: 'Fixture assertions verify completed action and checkpoint evidence.',
    })
    const trace = JSON.parse(await readFile(compiled.tracePath, 'utf8'))
    assert.deepEqual(trace.steps.map(step => step.action), ['checkpoint', 'click', 'fill', 'checkpoint', 'checkpoint'])
    const baseline = JSON.parse(await readFile(compiled.baselinePath, 'utf8'))
    assert.equal(baseline.checkpoints.length, 3)
    const replay = await executeTrace({
      trace, baseline: await loadBaseline(compiled.baselinePath), outputDir: join(output, 'clean-replay'),
    })
    assert.equal(replay.status, 'passed')
    await assert.rejects(agentCommand(sessionPath, 'act', { action: 'click', target: { css: 'h1' } }), /finished/)
  })

  test('inert controls cannot become a clean baseline even with an unrelated true terminal assertion', async () => {
    const { sessionPath } = await start('inert')
    await agentCommand(sessionPath, 'checkpoint', { name: 'choice' })
    await assert.rejects(agentCommand(sessionPath, 'act', {
      action: 'click', target: { role: 'button', name: 'Inert' },
    }), /no observable/)
    const handoff = await agentCommand(sessionPath, 'finish', {
      summary: 'Inert button found', terminal: [{ kind: 'visible', target: { css: 'h1' } }],
    })
    assert.equal(handoff.status, 'failed')
    assert.equal(handoff.failures.some(failure => failure.kind === 'action'), true)
    await assert.rejects(agentCommand(sessionPath, 'compile', { reviewer: 'test', rationale: 'Cannot override failure' }), /clean candidates/)
  })

  test('failed early investigation can finish without inventing completion or checkpoint evidence', async () => {
    const { sessionPath } = await start('early-failure')
    await assert.rejects(agentCommand(sessionPath, 'act', { action: 'evaluate', script: 'true' }), /not supported/)
    const handoff = await agentCommand(sessionPath, 'finish', { passed: false, summary: 'Initial screen needs correction' })
    assert.equal(handoff.status, 'failed')
    assert.deepEqual(handoff.checkpoints, [])
    assert.equal(JSON.parse(await readFile(handoff.runPath, 'utf8')).completed, false)
  })

  test('browser pages cannot send commands through the loopback server', async () => {
    const { sessionPath, port, token } = await start('authentication')
    const endpoint = `http://127.0.0.1:${port}/command`
    const unauthorized = await fetch(endpoint, { method: 'POST', body: '{}' })
    assert.equal(unauthorized.status, 403)
    const origin = await fetch(endpoint, {
      method: 'POST', headers: {
        authorization: `Bearer ${token}`, 'content-type': 'application/json', origin: 'http://localhost:3030',
      }, body: JSON.stringify({ command: 'stop' }),
    })
    assert.equal(origin.status, 403)
    assert.equal((await agentCommand(sessionPath, 'observe')).status, 'recording')
  })

  test('unknown options are rejected before launching or changing a session', async () => {
    await assert.rejects(main(['start', '--url', url, '--fat', 'true']), /Unknown option --fat/)
    await assert.rejects(startAgentSession({ url, fastt: true }), /Unknown session option fastt/)
  })

  test('an observed visual defect cannot be hidden by saving only a later clean checkpoint', async () => {
    const { sessionPath, observation } = await start('observed-defect', { url: `${url}?offscreen=1` })
    assert.equal(observation.findings.some(finding => finding.severity === 'error'), true)
    await agentCommand(sessionPath, 'act', { action: 'click', target: { role: 'button', name: 'Blue' } })
    await agentCommand(sessionPath, 'checkpoint', { name: 'clean-final-screen' })
    const handoff = await agentCommand(sessionPath, 'finish', {
      summary: 'Later screen is clean', terminal: [{ kind: 'text', target: { css: 'h1' }, value: 'Finished' }],
    })
    assert.equal(handoff.status, 'failed')
    assert.equal(handoff.failures.some(failure => failure.kind === 'layout' && failure.observation === 1), true)
  })
})
