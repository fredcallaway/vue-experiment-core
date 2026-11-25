import { expect, test } from 'bun:test'
import { createServer } from 'node:http'
import * as h3 from 'h3'
import { createFetch } from 'ofetch'

test('the local Prolific proxy returns JSON for review acknowledgments and preserves errors', async () => {
  const approvals = 'submissions/bulk-approve/'
  const payment = 'bulk-bonus-payments/' + 'a'.repeat(24) + '/pay/'
  const setup = 'submissions/bonus-payments/'
  const app = h3.createApp()
  const router = h3.createRouter()
  const originalFetch = globalThis.$fetch
  const upstream = new Map([
    [approvals, Response.json('The request to bulk approve has been made successfully.')],
    [payment, Response.json('Bonus payment accepted', { status: 202 })],
    [setup, Response.json({ id: 'a'.repeat(24), total_amount: 694 }, { status: 201 })],
  ])
  Object.assign(globalThis, h3)
  globalThis.$fetch = createFetch({
    fetch: async (url, options) => {
      const prefix = 'https://api.prolific.com/api/v1/'
      expect(url.startsWith(prefix)).toBe(true)
      expect(options.method).toBe('POST')
      expect(options.headers.get('Authorization')).toBe('Token fixture-token')
      return upstream.get(url.slice(prefix.length)).clone()
    },
  })
  const handler = (await import('../server/api/prolific/[...slug].ts')).default
  router.post('/api/prolific/**:slug', handler)
  app.use(router)
  const server = createServer(h3.toNodeListener(app))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const post = path => fetch(`http://127.0.0.1:${server.address().port}/api/prolific/${path}`, {
    method: 'POST',
    headers: { 'X-Prolific-Token': 'fixture-token', 'Content-Type': 'application/json', Accept: 'application/json' },
    body: '{}',
  })

  try {
    const approved = await post(approvals)
    expect(approved.status).toBe(200)
    expect(approved.headers.get('content-type')).toContain('application/json')
    expect(await approved.json()).toEqual({ message: 'The request to bulk approve has been made successfully.' })

    const paid = await post(payment)
    expect(paid.status).toBe(202)
    expect(await paid.json()).toEqual({ message: 'Bonus payment accepted' })
    expect(await (await post(setup)).json()).toEqual({ id: 'a'.repeat(24), total_amount: 694 })

    upstream.set(payment, new Response('Bonus payment accepted', {
      status: 202,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    }))
    expect(await (await post(payment)).json()).toEqual({ message: 'Bonus payment accepted' })

    upstream.set(payment, new Response('<html>Unexpected upstream page</html>', {
      headers: { 'Content-Type': 'text/html' },
    }))
    const html = await post(payment)
    expect(html.headers.get('content-type')).toContain('text/html')

    upstream.set(payment, Response.json({ detail: 'Payment declined' }, { status: 400 }))
    const declined = await post(payment)
    expect(declined.status).toBe(400)
    expect((await declined.json()).data).toEqual({ detail: 'Payment declined' })
  } finally {
    globalThis.$fetch = originalFetch
    await new Promise(resolve => server.close(resolve))
  }
})
