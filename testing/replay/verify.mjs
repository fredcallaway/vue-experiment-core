import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { compileRun, runTrace } from './index.mjs'

const outputDir = await mkdtemp(join(tmpdir(), 'experiment-replay-verification-'))
const browser = await chromium.launch({ headless: true })
const trace = {
  version: 1, id: 'canvas-choice', startUrl: 'http://127.0.0.1:49198/fixture',
  viewport: { width: 960, height: 720 }, rootSelector: '#experiment',
  scope: { kind: 'full', label: 'Synthetic two-screen canvas choice' },
  steps: [
    { action: 'checkpoint', name: 'choice', assertions: [{ kind: 'visible', target: { text: 'Choose the blue shape' } }] },
    { action: 'click', target: { role: 'button', name: 'Choose' } },
    { action: 'checkpoint', name: 'done', assertions: [{ kind: 'visible', target: { text: 'Done' } }] },
  ],
  completion: [{ kind: 'visible', target: { text: 'Done' } }, { kind: 'event', name: 'choice', count: 1, where: { value: 'blue' } }],
}
const fixture = variant => `<!doctype html><html><head><style>
body { margin: 0; font: 20px system-ui; background: #eef2f5; }
#experiment { margin: 40px; padding: 40px; width: 640px; background: white; }
button { font: inherit; padding: 12px 32px; border: 1px solid #111; border-radius: 8px; cursor: pointer; }
canvas { display: block; margin-bottom: 20px; }
${variant === 'finite-transition' ? '#experiment {animation: fade 600ms linear both} @keyframes fade {from{opacity:0.2}to{opacity:1}}' : ''}
</style></head><body><main id="experiment">
<p>Choose the blue shape</p><canvas width="260" height="140"></canvas><button>Choose</button><p id="result"></p>
${variant === 'volatile' ? '<span id="clock" style="display:block;width:180px;height:32px">0.0000</span>' : ''}
</main><script>
window.events = []; window.stage = 'choice';
const canvas = document.querySelector('canvas'), ctx = canvas.getContext('2d');
ctx.fillStyle = '${variant === 'canvas-color' ? '#ff3b2b' : '#174ec7'}'; ctx.fillRect(20, 20, 180, 90);
if ('${variant}' === 'runtime-error') console.error('Injected runtime error');
if ('${variant}' === 'volatile') setInterval(() => document.querySelector('#clock').textContent = Math.random().toFixed(4), 16);
document.querySelector('button').addEventListener('click', event => {
  ${variant === 'no-op' ? 'return;' : ''}
  if ('${variant}' !== 'missing-event') window.events.push({eventType:'choice',data:{value:'blue'}});
  document.querySelector('#result').textContent = 'Done'; window.stage = 'done'; event.target.disabled = true;
});
</script></body></html>`

async function run(variant, baseline, suffix = variant, activeTrace = trace) {
  const context = await browser.newContext({ viewport: trace.viewport })
  const page = await context.newPage()
  await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: fixture(variant) }))
  const result = await runTrace({
    page, trace: activeTrace, baseline, outputDir: join(outputDir, suffix),
    provenance: { environment: { browser: browser.version(), viewport: trace.viewport } },
    readEvents: () => page.evaluate(() => window.events),
    captureExtras: () => page.evaluate(() => ({ stage: window.stage })),
  })
  await context.close()
  return result
}

try {
  const candidate = await run('clean', undefined, 'candidate')
  assert.equal(candidate.status, 'candidate', JSON.stringify(candidate.failures))
  assert.throws(() => compileRun({ trace, run: candidate }), /reviewer/)
  const baseline = compileRun({ trace, run: candidate,
    approval: { reviewer: 'verification-fixture', rationale: 'Known fixture geometry, blue stimulus, and choice event inspected' } })
  const repeat = await run('clean', baseline, 'repeat')
  assert.equal(repeat.status, 'passed', JSON.stringify(repeat.failures))
  const finiteTransition = await run('finite-transition', baseline)
  assert.equal(finiteTransition.status, 'passed', JSON.stringify(finiteTransition.failures))
  assert(finiteTransition.checkpoints[0].animationSettling.waited > 0)
  const canvas = await run('canvas-color', baseline)
  assert.equal(canvas.status, 'needs-agent-review')
  assert(canvas.failures.some(failure => failure.kind === 'visual'))
  assert(!canvas.failures.some(failure => failure.kind === 'structure'))
  const missingEvent = await run('missing-event', baseline)
  assert.equal(missingEvent.status, 'needs-agent-review')
  assert(missingEvent.failures.some(failure => failure.message.includes('event choice')))
  const noOp = await run('no-op', baseline)
  assert.equal(noOp.status, 'needs-agent-review')
  const runtime = await run('runtime-error', undefined)
  assert.equal(runtime.status, 'needs-agent-review')
  assert.throws(() => compileRun({ trace, run: runtime,
    approval: { reviewer: 'fixture', rationale: 'Should reject browser errors' } }), /clean candidates/)
  const tamperedPath = candidate.checkpoints[0].screenshotPath
  const bytes = await readFile(tamperedPath)
  await writeFile(tamperedPath, Buffer.from('tampered'))
  assert.throws(() => compileRun({ trace, run: candidate,
    approval: { reviewer: 'fixture', rationale: 'Should reject modified evidence' } }), /bytes changed/)
  await writeFile(tamperedPath, bytes)
  const maskedTrace = structuredClone(trace)
  for (const step of maskedTrace.steps.filter(step => step.action === 'checkpoint')) {
    step.masks = [{ selector: '#clock', reason: 'Synthetic rapidly changing decorative clock' }]
  }
  const maskedCandidate = await run('volatile', undefined, 'masked-candidate', maskedTrace)
  assert.equal(maskedCandidate.status, 'candidate', JSON.stringify(maskedCandidate.failures))
  const maskedBaseline = compileRun({ trace: maskedTrace, run: maskedCandidate,
    approval: { reviewer: 'verification-fixture', rationale: 'Only the unrelated fixed-size clock is excluded' } })
  const maskedRepeat = await run('volatile', maskedBaseline, 'masked-repeat', maskedTrace)
  assert.equal(maskedRepeat.status, 'passed', JSON.stringify(maskedRepeat.failures))
  const invalidMaskTrace = structuredClone(maskedTrace)
  invalidMaskTrace.steps[0].masks[0].selector = '#experiment'
  const invalidMask = await run('volatile', undefined, 'invalid-mask', invalidMaskTrace)
  assert.equal(invalidMask.status, 'needs-agent-review')
  assert(invalidMask.failures.some(failure => failure.message.includes('descendants')))
  const summary = {
    outputDir, results: [candidate, repeat, finiteTransition, canvas, missingEvent, noOp, runtime,
      maskedCandidate, maskedRepeat, invalidMask]
      .map(run => ({ status: run.status, elapsedMs: run.elapsedMs, failures: run.failures.map(failure => failure.kind) })),
    invariants: ['unchanged replay passes', 'canvas pixel change caught without structural difference',
      'missing semantic event fails', 'no-op interaction fails completion', 'runtime error cannot compile',
      'unreviewed candidate cannot compile', 'modified screenshot cannot compile',
      'explicit narrow volatile masks replay', 'masking the participant root fails closed'],
  }
  await mkdir(outputDir, { recursive: true })
  await writeFile(join(outputDir, 'summary.json'), JSON.stringify(summary, null, 2))
  console.log(JSON.stringify(summary, null, 2))
} finally {
  await browser.close()
}
