import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { captureVisualEvidence, inspectLayout } from './index.mjs'

const output = await mkdtemp(join(tmpdir(), 'experiment-visual-check-'))
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1000, height: 800 }, deviceScaleFactor: 1 })
const fixture = (body, css = '') => `<!doctype html><html><head><style>
  * { box-sizing: border-box } body { margin: 0; font: 16px Arial }
  .main-content { position: relative; width: 800px; min-height: 600px; margin: 20px auto; padding: 30px }
  button { min-width: 100px; min-height: 42px; font: inherit }
  ${css}
  </style></head><body><main class="main-content">${body}</main></body></html>`
const cases = [
  { name: 'clean', body: '<h1>Choose an option</h1><p>Press either button to continue.</p><button>Left</button> '
    + '<button>Right</button>', expected: [] },
  { name: 'clipped-control', body: '<div style="width: 80px; overflow: hidden"><button>Continue</button></div>',
    expected: ['clipped-content'] },
  { name: 'clipped-text', body: '<p style="width:80px;height:20px;overflow:hidden;white-space:nowrap">'
    + 'These essential instructions should remain visible.</p>', expected: ['clipped-text'] },
  { name: 'covered-control', body: '<button>Continue</button><div style="position:absolute;'
    + 'inset:0;background:white">Cover</div>', expected: ['occluded-control'] },
  { name: 'offscreen-control', body: '<button style="position:fixed;left:-500px">Continue</button>',
    expected: ['offscreen-content'] },
  { name: 'broken-image', body: '<img src="data:image/png;base64,broken" alt="Stimulus" width="120" height="80">',
    expected: ['broken-image'] },
  { name: 'disabled-control', body: '<button disabled>Continue</button><div style="position:absolute;'
    + 'inset:0;background:white">Cover</div>', expected: [], disabled: true },
  { name: 'scroll-container', body: '<div style="height:70px;overflow:auto"><p>Scrollable instructions.</p>'
    + '<button style="margin-top:200px">Continue</button></div>', expected: [] },
  { name: 'document-scroll', body: '<p>Long instructions.</p><button style="margin-top:1100px">Continue</button>',
    expected: [] },
  { name: 'hidden-content', body: '<div hidden><button>Continue</button></div><p>Visible content</p>', expected: [] },
  { name: 'decorative-child', body: '<button><span aria-hidden="true">→</span> Continue</button>', expected: [] },
  { name: 'ellipsis', body: '<p style="width:80px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">'
    + 'Intentionally truncated summary text.</p>', expected: [] },
  { name: 'ignored-decoration', body: '<div class="decoration" style="width:40px;overflow:hidden">'
    + '<p>Intentional art overflowing its box.</p></div><button>Continue</button>',
    options: { ignoreSelectors: ['.decoration'] }, expected: [] },
  { name: 'partial-overlay', body: '<div style="position:relative;width:200px"><button style="width:200px">'
    + 'Continue</button><div style="position:absolute;inset:0 35% 0 0;background:white"></div></div>',
    expected: ['partially-occluded-control'] },
  { name: 'fixed-offscreen-on-long-page', body: '<p style="height:1200px">Long instructions</p>'
    + '<button style="position:fixed;top:1000px">Continue</button>', expected: ['offscreen-content'] },
  { name: 'negative-offscreen-on-long-page', body: '<p style="height:1200px">Long instructions</p>'
    + '<button style="position:absolute;top:-200px">Continue</button>', expected: ['offscreen-content'] },
  { name: 'inert-control', body: '<div inert><button>Continue</button></div>', expected: [], disabled: true },
  { name: 'partly-clipped-media', body: '<div style="width:50px;overflow:hidden"><svg width="100" height="60">'
    + '<rect width="100" height="60" fill="blue" /></svg></div>', expected: ['clipped-content'] },
  { name: 'clipped-card-bottom', body: '<div style="height:100px;overflow:hidden">'
    + '<section style="height:130px;background:#eee;border:1px solid black"><button>Continue</button></section></div>',
    expected: ['clipped-container'] },
  { name: 'center-covered', body: '<div style="position:relative;width:200px"><button style="width:200px">'
    + 'Continue</button><div style="position:absolute;inset:30% 45%;background:white"></div></div>',
    expected: ['partially-occluded-control'] },
  { name: 'scaled-container', body: '<div style="width:200px;height:80px;overflow:hidden;transform:scale(2);'
    + 'transform-origin:top left"><button>Continue</button></div>', expected: [] },
  { name: 'clipped-scaled-container', body: '<div style="width:70px;height:80px;overflow:hidden;transform:scale(.5);'
    + 'transform-origin:top left"><button>Continue</button></div>', expected: ['clipped-content'] },
  { name: 'nested-consent-scroll', body: '<div style="height:400px;overflow:hidden">'
    + '<div style="height:220px;overflow-y:auto;border:1px solid black">'
    + '<p style="height:300px">First paragraph</p><p>Later instructions still reachable by scrolling.</p>'
    + '<button>Continue</button></div></div>', expected: [] },
  { name: 'clipping-inside-scroller', body: '<div style="height:400px;overflow:hidden">'
    + '<div style="height:220px;overflow-y:auto"><div style="width:50px;overflow:hidden">'
    + '<button>Continue</button></div></div></div>', expected: ['clipped-content'] },
]
const results = []
try {
  for (const test of cases) {
    await page.setContent(fixture(test.body, test.css))
    const beforeScroll = await page.evaluate(() => ({ x: scrollX, y: scrollY }))
    const result = await inspectLayout(page, test.options)
    const kinds = [...new Set(result.findings.map((finding) => finding.kind))]
    for (const expected of test.expected) assert(kinds.includes(expected), `${test.name} missing ${expected}: ${kinds}`)
    if (!test.expected.length) {
      assert.deepEqual(kinds, [], `${test.name} false positive: ${JSON.stringify(result.findings)}`)
    }
    if (test.disabled) {
      assert(result.controls.some((control) => control.disabled), `${test.name} missing disabled state`)
    }
    const afterScroll = await page.evaluate(() => ({ x: scrollX, y: scrollY }))
    assert.deepEqual(afterScroll, beforeScroll, 'Layout checks must not scroll the experiment')
    results.push({ name: test.name, expected: test.expected, found: kinds, elapsedMs: result.elapsedMs })
    if (['clean', 'clipped-control', 'covered-control', 'clipped-text'].includes(test.name)) {
      await captureVisualEvidence(page, { path: join(output, `${test.name}.png`) })
    }
  }
  await page.setContent(fixture('<p>Visible content</p>'))
  const missing = await inspectLayout(page, { rootSelector: '.missing' })
  assert.equal(missing.findings[0].kind, 'missing-root')
  const limited = await inspectLayout(page, { maxElements: 1 })
  assert(limited.findings.some((finding) => finding.kind === 'incomplete-audit'))
  const samples = []
  await page.setContent(fixture('<h1>Choose an option</h1><button>Left</button><button>Right</button>'))
  for (let index = 0; index < 20; index++) samples.push((await inspectLayout(page)).elapsedMs)
  const sorted = samples.toSorted((a, b) => a - b)
  const summary = { cases: results.length + 2, results, benchmark: {
    samples: samples.length,
    medianMs: sorted[Math.floor(sorted.length / 2)],
    p95Ms: sorted[Math.floor(sorted.length * .95)],
  }, output }
  await writeFile(join(output, 'results.json'), JSON.stringify(summary, null, 2))
  console.log(JSON.stringify(summary, null, 2))
} finally {
  await browser.close()
}
