import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { safeBrowser } from './browser.mjs'

// node core/testing/preview.integration.mjs http://localhost:3031 [screenshot-directory]
const output = resolve(process.argv[3] ?? '.experiment-tests/preview')
await mkdir(output, { recursive: true })
const browser = await safeBrowser({ url: `${process.argv[2]}/dev`, viewport: { width: 1600, height: 1000 } })
try {
  const { page } = browser
  const url = new URL(browser.url)
  url.searchParams.set('preview', '0')
  url.searchParams.set('condition.preview-test', 'preserved')
  await page.goto(url.href)
  await page.waitForFunction(() => {
    const epoch = window.__experimentTest?.snapshot().epoch
    return epoch && epoch !== '__TOP_EPOCH__'
  })
  const initialEpoch = (await browser.readState()).epoch
  await page.getByRole('button', { name: 'Next Epoch', exact: true }).click()
  await page.waitForFunction(previous => window.__experimentTest.snapshot().epoch !== previous, initialEpoch)
  const before = await browser.readState()
  await page.locator('.main-content').evaluate(el => { window.__previewFrame = el })

  const nav = page.getByRole('navigation', { name: 'Developer navigation' })
  const geometry = () => nav.locator('a, button').evaluateAll(els => els.map(el => ({
    text: el.textContent.trim(), bounds: el.getBoundingClientRect().toJSON(),
  })))
  const developGeometry = await geometry()
  assert.equal(await nav.evaluate(el => getComputedStyle(el).color), 'rgb(0, 0, 0)')
  await page.screenshot({ path: resolve(output, 'develop.png') })

  await page.getByRole('link', { name: 'Preview', exact: true }).click()
  await page.locator('.preview-mode').waitFor()
  assert.deepEqual(await geometry(), developGeometry, 'Every navigation item stays in the same position')
  assert.equal(await nav.evaluate(el => getComputedStyle(el).color), 'rgb(255, 255, 255)')
  assert.ok((await nav.locator('a, button').evaluateAll(els => els.map(el => getComputedStyle(el).color)))
    .every(color => color === 'rgb(255, 255, 255)'), 'All Preview navigation uses white text')
  assert.equal(await page.getByRole('link', { name: 'Preview', exact: true }).getAttribute('aria-current'), 'page')
  assert.equal(await page.evaluate(() => document.querySelector('.main-content') === window.__previewFrame), true)
  const after = await browser.readState()
  assert.equal(after.epoch, before.epoch, 'Switching modes preserves the current epoch')
  assert.equal(after.events.filter(event => event.eventType === 'epoch.start').length,
    before.events.filter(event => event.eventType === 'epoch.start').length, 'Switching does not remount epochs')
  assert.equal(new URL(page.url()).searchParams.get('condition.preview-test'), 'preserved')

  const frame = page.locator('.main-content')
  const frameBounds = await frame.boundingBox()
  const workspaceBounds = await page.locator('.developer-layout').boundingBox()
  assert.equal(frameBounds.x + frameBounds.width / 2, workspaceBounds.x + workspaceBounds.width / 2)
  assert.equal(frameBounds.y + frameBounds.height / 2, workspaceBounds.y + workspaceBounds.height / 2)
  await page.screenshot({ path: resolve(output, 'preview.png') })

  const trigger = page.getByRole('button', { name: 'Outline', exact: true })
  const panel = page.getByRole('region', { name: 'Experiment outline' })
  await trigger.hover()
  await panel.waitFor()
  await page.waitForFunction(() => document.querySelectorAll('#preview-outline-panel [data-epoch-id]').length > 2)
  await panel.locator(`[data-epoch-id="${initialEpoch}"]`).getByText(initialEpoch.split('-').at(-1), { exact: true }).click()
  await page.waitForFunction(target => window.__experimentTest.snapshot().epoch === target, initialEpoch)
  assert.deepEqual(await frame.boundingBox(), frameBounds, 'Opening and using the outline never moves the experiment')
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#preview-outline-panel')).opacity === '1')
  await page.screenshot({ path: resolve(output, 'outline.png') })
  await page.mouse.move(800, 900)
  await panel.waitFor({ state: 'hidden' })

  // A click keeps the panel open while the pointer returns to the experiment.
  await trigger.click()
  await page.mouse.move(800, 900)
  await panel.waitFor()
  await panel.getByTitle('Pin current epoch', { exact: true }).click()
  await page.waitForURL(/jump=/)
  assert.equal(new URL(page.url()).searchParams.get('preview'), '1', 'Pinning retains Preview in the URL')
  const pinnedEpoch = new URL(page.url()).searchParams.get('jump')
  await page.getByRole('link', { name: 'Develop', exact: true }).click()
  await page.locator('.main-outline').waitFor()
  assert.equal(new URL(page.url()).searchParams.get('jump'), pinnedEpoch, 'Mode links retain a newly pinned epoch')
  assert.deepEqual(await geometry(), developGeometry)

  await page.getByRole('link', { name: 'Preview', exact: true }).click()
  await page.locator('.preview-mode').waitFor()
  await trigger.focus()
  await page.keyboard.press('Enter')
  await panel.waitFor()
  await page.keyboard.press('Tab')
  assert.equal(await panel.evaluate(el => el.contains(document.activeElement)), true, 'Keyboard can enter the outline')
  await page.keyboard.press('Escape')
  await panel.waitFor({ state: 'hidden' })
  assert.equal(await trigger.evaluate(el => el === document.activeElement), true, 'Escape restores trigger focus')

  await trigger.click()
  await panel.waitFor()
  await frame.click({ position: { x: 10, y: 10 } })
  await panel.waitFor({ state: 'hidden' })
  await page.getByRole('button', { name: 'Tutorial', exact: true }).click()
  await page.waitForURL(/tutorial=1/)
  assert.equal(new URL(page.url()).searchParams.get('preview'), '1', 'Tutorial toggling retains Preview')
  assert.equal(new URL(page.url()).searchParams.get('jump'), pinnedEpoch, 'Tutorial toggling retains a newly pinned epoch')
  await page.getByRole('button', { name: 'Tutorial', exact: true }).click()
  await page.waitForURL(url => !url.searchParams.has('tutorial'))
  await page.reload()
  await trigger.waitFor()
  assert.equal((await browser.readState()).epoch, pinnedEpoch, 'Reload keeps Preview and its pinned epoch')

  // Browser Back/Forward also updates mode and leaves one isolated worker.
  await page.getByRole('link', { name: 'Develop', exact: true }).click()
  await page.locator('.main-outline').waitFor()
  await page.goBack()
  await page.locator('.preview-mode').waitFor()
  await page.goForward()
  await page.locator('.main-outline').waitFor()
  assert.equal(await page.locator('iframe[title="outline-worker"]').count(), 1)
  const worker = page.frameLocator('iframe[title="outline-worker"]')
  assert.equal(await worker.getByRole('navigation').count(), 0, 'Workers contain no interactive chrome')
  assert.equal(await worker.locator('iframe').count(), 0, 'Workers cannot recursively spawn themselves')

  // A direct Preview load must build a complete outline from empty storage.
  await page.evaluate(() => localStorage.clear())
  const direct = new URL(browser.url)
  direct.searchParams.delete('noDev')
  direct.searchParams.set('preview', '')
  await page.goto(direct.href)
  await trigger.click()
  await page.waitForFunction(() => document.querySelectorAll('#preview-outline-panel [data-epoch-id]').length > 2)
  await page.setViewportSize({ width: 1000, height: 800 })
  const narrowBounds = await frame.boundingBox()
  const narrowPanel = await panel.boundingBox()
  assert.ok(narrowPanel.x >= 0 && narrowPanel.x + narrowPanel.width <= 1000)
  assert.ok(narrowPanel.y >= 0 && narrowPanel.y + narrowPanel.height <= 800)
  await page.mouse.move(400, 750)
  assert.deepEqual(await frame.boundingBox(), narrowBounds)
  await page.screenshot({ path: resolve(output, 'outline-narrow.png') })

  const legacy = new URL(browser.url)
  legacy.searchParams.delete('preview')
  legacy.searchParams.set('noDev', '1')
  await page.goto(legacy.href)
  await trigger.waitFor()
  await page.getByRole('link', { name: 'Docs', exact: true }).click()
  await page.waitForURL(/\/docs/)
  await page.getByRole('link', { name: 'Preview', exact: true }).click()
  await page.waitForURL(url => url.pathname === '/dev' && url.searchParams.get('preview') === '1')
  await trigger.waitFor()
  await page.getByRole('link', { name: 'Examples', exact: true }).click()
  await page.waitForURL(/\/examples/)
  await page.getByRole('link', { name: 'Develop', exact: true }).click()
  await page.waitForURL(url => url.pathname === '/dev' && !url.searchParams.has('preview'))
  await page.locator('.main-outline').waitFor()
  assert.deepEqual(browser.errors, [], 'Preview interactions produce no browser errors')
  console.log(`Passed: mode/state/query preservation, fixed navigation, centered frame, hover/click/keyboard outline,` +
    ` cold Preview, reload/history, worker isolation and narrow viewport; evidence: ${output}`)
} finally {
  await browser.close()
}
