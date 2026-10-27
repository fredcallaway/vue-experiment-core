import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { inspectLayout } from './visual/index.mjs'

// Run against an existing dev server. Backend requests are fixtures; external traffic is blocked.
const url = new URL('/prolific', process.argv[2])
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && url.protocol === 'http:')
const output = resolve(process.argv[3] ?? '.experiment-tests/prolific-token-help')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' })
  await context.route('**/*', route => {
    const request = route.request()
    const target = new URL(request.url())
    if (target.origin !== url.origin) return route.abort('blockedbyclient')
    if (target.pathname.startsWith('/api/')) {
      const json = target.pathname === '/api/prolific/token' ? { token: '' }
        : target.pathname === '/api/syncData' ? { meta: {}, numUpdated: 0, numError: 0 } : {}
      return route.fulfill({ json })
    }
    return ['GET', 'HEAD'].includes(request.method()) ? route.continue() : route.abort('blockedbyclient')
  })
  await context.routeWebSocket('**/*', socket => socket.close())
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(url.href)
  const help = page.getByRole('button', { name: 'How do I get an API token?' })
  const dialog = page.getByRole('dialog', { name: 'Get a Prolific API token' })
  const token = page.getByRole('textbox', { name: 'API token', exact: true })
  const initialToken = await token.inputValue()
  await page.evaluate(() => {
    window.tokenHelpEscapes = 0
    window.addEventListener('keydown', event => {
      if (event.key === 'Escape') window.tokenHelpEscapes++
    })
  })
  await help.click()
  await dialog.waitFor()
  for (let step = 0; step < 8; step++) {
    await page.keyboard.press('Tab')
    // Native dialogs may tab through browser chrome, represented by body focus.
    assert.ok(await dialog.evaluate(el => el.contains(document.activeElement) || document.activeElement === document.body),
      'Tab never focuses a control behind the modal')
  }
  for (const viewport of [{ width: 1280, height: 900 }, { width: 800, height: 600 }]) {
    await page.setViewportSize(viewport)
    const layout = await inspectLayout(page, { rootSelector: '.token-help', requireInViewport: true })
    assert.deepEqual(layout.findings, [], 'The token instructions fit and remain accessible')
    await page.screenshot({ path: resolve(output, `token-help-${viewport.width}.png`) })
  }
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'hidden' })
  assert.equal(await page.evaluate(() => window.tokenHelpEscapes), 0, 'Escape does not close a parent connection dialog')
  assert.ok(await help.evaluate(el => document.activeElement === el), 'Closing restores focus to the help button')
  await help.click()
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  assert.equal(await token.inputValue(), initialToken, 'Opening help does not change the API token')
  assert.deepEqual(errors, [], 'Token help produces no browser runtime errors')
  console.log(`Passed: token help, focus containment/restoration, Escape, Close and responsive layout; ${output}`)
} finally {
  await browser.close()
}
