import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { safeBrowser, testUrl } from './browser.mjs'

test('test URLs cannot select participant, backend, encoded, or nonlocal routes', () => {
  for (const url of [
    'https://example.com/dev', 'http://localhost:3030/exp', 'http://localhost:3030/%65xp',
    'http://localhost:3030/api/deploy', 'http://localhost:3030/dev?mode=live', 'http://localhost:3030/%zz',
    'http://localhost:3030/examples/%2e%2e%2fexp', 'http://localhost:3030/examples/%2e%2e%2fapi/deploy',
  ]) assert.throws(() => testUrl(url))
  const url = new URL(testUrl('http://localhost:3030/dev?jump=trial', { seed: 'seed-1' }))
  assert.equal(url.searchParams.get('session_id'), 'seed-1')
  assert.equal(url.searchParams.get('testing'), '1')
  assert.equal(url.searchParams.get('jump'), 'trial')
})

test('fresh browser blocks external HTTP, external WebSockets and local writes before delivery', async () => {
  let externalRequests = 0
  let localWrites = 0
  const sink = createServer((request, response) => { externalRequests++; response.end('unexpected') })
  await new Promise(resolve => sink.listen(0, '127.0.0.1', resolve))
  const externalPort = sink.address().port
  const server = createServer((request, response) => {
    if (request.method !== 'GET') localWrites++
    response.setHeader('Content-Type', 'text/html')
    response.end(`<main class="main-content">Ready</main><script>
      fetch('http://127.0.0.1:${externalPort}/dev').catch(() => {});
      fetch('/write', {method:'POST',body:'test'}).catch(() => {});
      new WebSocket('ws://127.0.0.1:${externalPort}/socket');
    </script>`)
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  let browser
  try {
    browser = await safeBrowser({ url: `http://127.0.0.1:${server.address().port}/dev` })
    await browser.page.goto(browser.url)
    for (let attempt = 0; attempt < 50 && browser.blockedRequests.length < 3; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    assert.equal(browser.blockedRequests.filter(item => item.kind === 'http').length, 2)
    assert.equal(browser.blockedRequests.filter(item => item.kind === 'websocket').length, 1)
    assert.equal(externalRequests, 0)
    assert.equal(localWrites, 0)
  } finally {
    await browser?.close()
    await Promise.all([server, sink].map(server => new Promise(resolve => server.close(resolve))))
  }
})
