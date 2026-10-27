import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { safeBrowser } from './browser.mjs'
import { inspectLayout } from './visual/index.mjs'

// Run against an existing dev server: node core/testing/docs.integration.mjs http://localhost:3030
const output = resolve(process.argv[3] ?? '.experiment-tests/docs')
await mkdir(output, { recursive: true })
const browser = await safeBrowser({ url: `${process.argv[2]}/docs` })
try {
  const { page } = browser
  const url = new URL(browser.url)
  url.searchParams.set('preview', '0')
  await page.goto(url.href)
  const content = page.locator('.docs-content')
  const heading = content.locator('h2, h3').first()
  await heading.waitFor()
  const pages = []
  for (let index = 0; index < 100; index++) {
    const title = await heading.textContent()
    assert.ok(!pages.some(item => item.title === title), `Navigation repeated ${title}`)
    const layout = await inspectLayout(page)
    const overflow = await page.locator('.main-content').evaluate(el => el.classList.contains('overflowing'))
    const scroll = await content.evaluate(el => ({
      top: el.scrollTop, height: el.scrollHeight, visibleHeight: el.clientHeight,
    }))
    assert.equal(scroll.top, 0, `The ${title} page starts at the top`)
    const screenshot = `${String(index + 1).padStart(2, '0')}.png`
    await page.screenshot({ path: resolve(output, screenshot) })
    pages.push({ title, overflow, scroll, findings: layout.findings, screenshot })
    const next = content.getByRole('button', { name: 'Next', exact: true })
    if (!await next.count()) break
    // Real clicks must be able to reach Next, including on scrollable documentation.
    await next.click()
    await page.waitForFunction(previous => {
      const title = document.querySelector('.docs-content h2, .docs-content h3')?.textContent
      return title && title !== previous
    }, title)
  }
  assert.ok(pages.length < 100, 'Documentation reaches its final page')

  // The final examples page exercises the scroll fallback. Its last link must
  // remain reachable, and jumping back through the outline must reset scrolling.
  const lastLink = content.getByRole('link').last()
  await lastLink.scrollIntoViewIfNeeded()
  const scrolledLayout = await inspectLayout(page)
  assert.ok(!scrolledLayout.findings.some(item => item.severity === 'error'), 'Scrolled content remains reachable')
  await page.screenshot({ path: resolve(output, 'examples-scrolled.png') })
  await page.locator('[data-epoch-id]').getByText('overview', { exact: true }).click()
  await page.waitForFunction(firstTitle => document.querySelector('.docs-content h2')?.textContent === firstTitle,
    pages[0].title)
  assert.equal(await content.evaluate(el => el.scrollTop), 0, 'Outline navigation resets the scroll position')
  await page.locator('[data-epoch-id]').getByText('technical', { exact: true }).click()
  await content.locator('[data-doc-page="intro"]').waitFor()
  await page.screenshot({ path: resolve(output, 'technical-intro.png') })
  const report = { pages, errors: browser.errors }
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2))
  const failures = pages.filter(item => item.overflow || item.findings.some(finding => finding.severity === 'error'))
  assert.equal(failures.length, 0,
    `Docs layout failures: ${failures.map(item => item.title).join(', ')}; see ${output}/report.json`)
  assert.deepEqual(browser.errors, [], 'Documentation produces no browser errors')
  console.log(`Passed: ${pages.length} Docs pages, layout, scrolling and outline navigation; evidence: ${output}`)
} finally {
  await browser.close()
}
