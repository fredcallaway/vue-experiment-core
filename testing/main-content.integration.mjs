import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { safeBrowser } from './browser.mjs'

// Run against an existing dev server: node core/testing/main-content.integration.mjs http://localhost:3819
const output = resolve(process.argv[3] ?? '.experiment-tests/overflow-warning')
await mkdir(output, { recursive: true })
const browser = await safeBrowser({ url: `${process.argv[2]}/dev`, seed: 'overflow-warning' })
try {
  const url = new URL(browser.url)
  url.searchParams.set('noDev', '0')
  const { page } = browser
  await page.goto(url.href)
  await page.locator('.main-content > .wfull').waitFor()
  await page.evaluate(() => {
    const content = document.querySelector('.main-content > .wfull')
    for (const child of content.children) child.style.display = 'none'
    const fixture = document.createElement('div')
    fixture.id = 'overflow-fixture'
    fixture.style.cssText = 'height:100%;width:100%'
    fixture.innerHTML = '<div id="growing-content" style="height:20px;width:20px;background:teal"></div>'
    content.append(fixture)
  })
  const frame = page.locator('.main-content')
  const bounds = await frame.boundingBox()
  const tooTall = Math.ceil(bounds.height) + 100
  const tooWide = Math.ceil(bounds.width) + 100
  const expectOverflow = async (expected) => {
    await page.waitForFunction(value => document.querySelector('.main-content').classList.contains('overflowing')
      === value, expected)
    assert.deepEqual(await frame.boundingBox(), bounds, 'The frame must stay fixed throughout content changes')
  }
  await expectOverflow(false)
  await page.locator('#growing-content').evaluate((el, height) => { el.style.height = `${height}px` }, tooTall)
  await expectOverflow(true)
  await page.screenshot({ path: resolve(output, 'overflow.png') })
  await page.locator('#growing-content').evaluate(el => { el.style.height = '20px' })
  await expectOverflow(false)
  await page.locator('#growing-content').evaluate((el, width) => { el.style.width = `${width}px` }, tooWide)
  await expectOverflow(true)
  await page.locator('#growing-content').evaluate(el => { el.style.width = '20px' })
  await expectOverflow(false)

  // A stylesheet change produces no mutation inside the observed content: ResizeObserver must catch it.
  await page.addStyleTag({ content: `#growing-content { min-height: ${tooTall}px }` })
  await expectOverflow(true)
  await page.locator('#growing-content').evaluate(el => el.remove())
  await expectOverflow(false)
  await page.locator('#overflow-fixture').evaluate((el, height) => {
    el.innerHTML = `<p style="height:${height}px">New epoch content</p>`
  }, tooTall)
  await expectOverflow(true)
  await page.locator('#overflow-fixture').evaluate(el => { el.textContent = 'Fits again' })
  await expectOverflow(false)
  await page.screenshot({ path: resolve(output, 'fits.png') })
  assert.deepEqual(browser.errors, [], 'No browser errors, including ResizeObserver loops')
  console.log(`Passed: growth, shrinkage, width, stylesheet resize, insertion and removal; evidence: ${output}`)
} finally {
  await browser.close()
}
