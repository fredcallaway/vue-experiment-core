import assert from 'node:assert/strict'
import { safeBrowser } from './browser.mjs'

// node core/testing/data-event-panels.integration.mjs http://localhost:3031
const browser = await safeBrowser({ url: `${process.argv[2]}/dev`, viewport: { width: 1800, height: 1000 } })
try {
  const { page } = browser
  const url = new URL(browser.url)
  url.searchParams.set('preview', '0')
  await page.goto(url.href)
  const divider = page.getByRole('separator', { name: 'Resize Data and Events panels' })
  await divider.waitFor()
  const data = page.locator(`[id="${await divider.getAttribute('aria-controls')}"]`)
  const height = async () => (await data.boundingBox()).height
  const dragBy = async (delta, xOffset = 0) => {
    const box = await divider.boundingBox()
    const x = box.x + box.width / 2
    const y = box.y + box.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + xOffset, y + delta, { steps: 8 })
    await page.mouse.up()
  }
  const eventsHeight = () => page.getByRole('heading', { name: 'Events', exact: true }).evaluate(heading =>
    heading.closest('.border-2').getBoundingClientRect().height)

  const initialData = await height()
  const initialEvents = await eventsHeight()
  await dragBy(-100)
  assert.ok(Math.abs(await height() - initialData + 100) < 2, 'Dragging up shrinks Data')
  assert.ok(Math.abs(await eventsHeight() - initialEvents - 100) < 2, 'Events gets the freed space')
  const releasedHeight = await height()
  await page.mouse.move(0, 0)
  assert.equal(await height(), releasedHeight, 'Releasing the pointer ends the drag')

  // Pointer capture keeps resizing active outside the divider's hit area.
  await dragBy(150, -500)
  assert.ok(Math.abs(await height() - releasedHeight - 150) < 2)
  await dragBy(1000)
  assert.equal(await divider.getAttribute('aria-valuenow'), await divider.getAttribute('aria-valuemax'))
  await dragBy(-1000)
  assert.equal(await divider.getAttribute('aria-valuenow'), await divider.getAttribute('aria-valuemin'))

  await divider.focus()
  await page.keyboard.press('End')
  assert.equal(await divider.getAttribute('aria-valuenow'), await divider.getAttribute('aria-valuemax'))
  const maximum = await height()
  await page.keyboard.press('ArrowUp')
  assert.ok(await height() < maximum)
  await page.keyboard.press('ArrowDown')
  assert.equal(await height(), maximum)
  await page.keyboard.press('Home')
  assert.equal(await divider.getAttribute('aria-valuenow'), await divider.getAttribute('aria-valuemin'))

  await page.setViewportSize({ width: 1800, height: 750 })
  await page.waitForFunction(() => {
    const divider = document.querySelector('[role="separator"]')
    const container = divider.parentElement
    const events = container.lastElementChild
    return events.getBoundingClientRect().bottom <= container.getBoundingClientRect().bottom + 1
  })
  assert.ok(await height() > 0 && await eventsHeight() > 0, 'Both panels remain usable after a viewport resize')
  assert.deepEqual(browser.errors, [], 'Resizing produces no browser errors')
  console.log('Passed: pointer drag, pointer capture, release, size limits, keyboard resizing, and viewport resize')
} finally {
  await browser.close()
}
