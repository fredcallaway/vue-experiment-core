import assert from 'node:assert/strict'
import { safeBrowser } from './browser.mjs'

// node core/testing/tutorial.integration.mjs http://localhost:3031
const browser = await safeBrowser({ url: `${process.argv[2]}/dev`, viewport: { width: 1600, height: 1000 } })
try {
  const { page } = browser
  const url = new URL(browser.url)
  url.searchParams.set('preview', '0')
  await page.goto(url.href)
  const toggle = page.getByRole('button', { name: 'Tutorial', exact: true })
  await toggle.waitFor()
  assert.equal(await toggle.getAttribute('aria-pressed'), 'false')
  assert.equal(await page.locator('.tutorial-target-active').count(), 0)

  await toggle.click()
  await page.waitForURL(/tutorial=1/)
  assert.equal(new URL(page.url()).searchParams.get('testing'), '1', 'Toggling preserves other query parameters')
  await page.locator('.tutorial-target-active').first().waitFor()

  const next = page.getByRole('button', { name: 'Next Epoch', exact: true })
  await next.hover()
  const tooltip = page.getByRole('tooltip')
  await tooltip.waitFor()
  assert.match(await tooltip.textContent(), /Marks the current epoch done/)
  const bounds = await tooltip.boundingBox()
  assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 1600 && bounds.y + bounds.height <= 1000)
  await page.mouse.move(0, 500)
  await tooltip.waitFor({ state: 'hidden' })
  await next.focus()
  await tooltip.waitFor()
  await page.keyboard.press('Escape')
  await tooltip.waitFor({ state: 'hidden' })

  const fast = page.getByRole('button', { name: /^(Enable|Disable) Fast Mode$/ })
  const initialFast = await fast.getAttribute('aria-pressed')
  await fast.click()
  await page.waitForFunction(previous => document.querySelector('button[aria-label$="Fast Mode"]')
    .getAttribute('aria-pressed') !== previous, initialFast)
  await fast.click()
  assert.equal(await fast.getAttribute('aria-pressed'), initialFast, 'Wrapped controls still receive clicks')

  await page.getByRole('link', { name: 'Examples', exact: true }).click()
  await page.waitForURL(/\/examples/)
  assert.equal(await toggle.getAttribute('aria-pressed'), 'true')
  await page.reload()
  await toggle.waitFor()
  assert.equal(await toggle.getAttribute('aria-pressed'), 'true')

  const trial = new URL('/examples/trial?testing=1&preview=0', url)
  await page.goto(trial.href)
  await page.locator('[data-epoch-id]').first().waitFor()
  assert.equal(await toggle.getAttribute('aria-pressed'), 'true', 'Session storage works without a tutorial query')
  await page.waitForFunction(() => [...document.querySelectorAll('.tutorial-target-active')]
    .some(el => el.textContent.includes('epoch.start')))
  assert.equal(await page.locator('.tutorial-target-active').filter({ hasText: 'epoch.start' }).count(), 1,
    'Repeated event cards share one highlight')

  // Filtering cards out and back in must not leave stale deduplication registrations.
  const filter = page.getByRole('textbox', { name: 'e.g. !epoch *.trial' })
  await filter.fill('!epoch')
  await page.locator('.tutorial-target-active').filter({ hasText: 'epoch.start' }).waitFor({ state: 'hidden' })
  await filter.fill('')
  await page.locator('.tutorial-target-active').filter({ hasText: 'epoch.start' }).waitFor()
  assert.equal(await page.locator('.tutorial-target-active').filter({ hasText: 'epoch.start' }).count(), 1)

  await toggle.click()
  await page.waitForFunction(() => document.querySelectorAll('.tutorial-target-active').length === 0)
  await page.reload()
  await toggle.waitFor()
  assert.equal(await toggle.getAttribute('aria-pressed'), 'false')
  assert.equal(await page.locator('.tutorial-target-active').count(), 0)
  const query = new URL(trial)
  query.searchParams.set('tutorial', '1')
  await page.goto(query.href)
  await page.locator('.tutorial-target-active').first().waitFor()
  assert.equal(await toggle.getAttribute('aria-pressed'), 'true')
  query.searchParams.set('tutorial', '0')
  await page.goto(query.href)
  await toggle.waitFor()
  assert.equal(await toggle.getAttribute('aria-pressed'), 'false')
  assert.equal(await page.locator('.tutorial-target-active').count(), 0)
  query.searchParams.delete('tutorial')
  await page.goto(`${query.href}&tutorial`)
  await page.locator('.tutorial-target-active').first().waitFor()
  assert.equal(await toggle.getAttribute('aria-pressed'), 'true', 'A bare tutorial flag follows URL flag conventions')

  // Same-page controls must share state even when storage-event delivery is unavailable.
  await browser.context.addInitScript(() => {
    for (const type of ['storage', 'vueuse-storage']) {
      window.addEventListener(type, event => {
        if ((event.key ?? event.detail?.key) === 'tutorial-mode') event.stopImmediatePropagation()
      }, true)
    }
  })
  await page.goto(new URL('/docs?testing=1&preview=0', url).href)
  await page.locator('.docs-content h2').first().waitFor()
  await toggle.click()
  await page.waitForFunction(() => document.querySelector('.tutorial-toggle').getAttribute('aria-pressed') === 'false'
    && document.querySelectorAll('.tutorial-target-active').length === 0)
  await page.getByRole('link', { name: 'Preview', exact: true }).click()
  await page.getByRole('link', { name: 'Develop', exact: true }).click()
  assert.equal(await toggle.getAttribute('aria-pressed'), 'false')
  assert.equal(await page.locator('.tutorial-target-active').count(), 0, 'Remounted controls stay off')
  await page.reload()
  await toggle.waitFor()
  assert.equal(await toggle.getAttribute('aria-pressed'), 'false')
  assert.equal(await page.locator('.tutorial-target-active').count(), 0)
  assert.deepEqual(browser.errors, [], 'Tutorial interactions produce no browser errors')
  console.log('Passed: UI toggle, hover/focus help, deduplication, navigation, reload, and URL activation')
} finally {
  await browser.close()
}
