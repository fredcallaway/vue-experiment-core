import { chromium } from 'playwright'

function isTestPath(pathname) {
  try { return /^\/dev\/?$|^\/examples(?:\/[a-zA-Z0-9_-]+)?\/?$/.test(decodeURIComponent(pathname)) }
  catch { return false }
}

export function testUrl(input, { seed } = {}) {
  const url = new URL(input)
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.protocol !== 'http:') {
    throw new Error('Experiment tests require a local HTTP dev server.')
  }
  if (url.username || url.password || !isTestPath(url.pathname)) {
    throw new Error('Use /dev or /examples for experiment tests.')
  }
  if (url.searchParams.get('mode') === 'live') throw new Error('Tests cannot run in live mode.')
  if (seed !== undefined) {
    if (typeof seed !== 'string' || !seed || /[.#$\[\]/]/.test(seed)) throw new Error('Invalid session seed.')
    url.searchParams.set('session_id', seed)
  }
  url.searchParams.set('testing', '1')
  url.searchParams.set('noDev', '1')
  return url.href
}

/** Fresh browser storage per run. External HTTP and WebSockets never reach a participant backend. */
export async function safeBrowser({ url: input, viewport = { width: 1280, height: 900 }, seed, fast = false } = {}) {
  const url = testUrl(input, { seed })
  const origin = new URL(url).origin
  const browser = await chromium.launch({ headless: true })
  try {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1, serviceWorkers: 'block' })
    const errors = []
    const blockedRequests = []
    const events = []
    await context.route('**/*', async route => {
      const request = route.request()
      const target = new URL(request.url())
      if (target.origin === origin && ['GET', 'HEAD'].includes(request.method())
        && (!request.isNavigationRequest() || isTestPath(target.pathname))) return route.continue()
      blockedRequests.push({ url: request.url(), method: request.method(), kind: 'http' })
      await route.abort('blockedbyclient')
    })
    await context.routeWebSocket('**/*', socket => {
      const target = new URL(socket.url())
      target.protocol = target.protocol === 'wss:' ? 'https:' : 'http:'
      if (target.origin === origin) return void socket.connectToServer()
      blockedRequests.push({ url: socket.url(), kind: 'websocket' })
      socket.close()
    })
    await context.addInitScript(({ fast }) => {
      sessionStorage.setItem('fast', String(fast))
      // A synchronous copy avoids console argument handles changing before Node reads them.
      window.__experimentConsoleEvents = []
      const debug = console.debug.bind(console)
      console.debug = (...args) => {
        if (args[0] === 'logEvent' && typeof args[1] === 'string') {
          try {
            window.__experimentConsoleEvents.push({ eventType: args[1], data: JSON.parse(JSON.stringify(args[2] ?? {})) })
          } catch { /* The normal app error logger still handles unserializable payloads. */ }
        }
        debug(...args)
      }
    }, { fast })
    const page = await context.newPage()
    page.setDefaultTimeout(5000)
    page.on('pageerror', error => errors.push({ kind: 'pageerror', message: error.message }))
    page.on('console', message => {
      if (message.type() !== 'error') return
      const text = message.text()
      if (text.includes('net::ERR_BLOCKED_BY_CLIENT')) return
      if (/WebSocket.*(?:failed|closed)/.test(text) && blockedRequests.some(item => text.includes(item.url))) return
      errors.push({ kind: 'console', message: text })
    })
    page.on('response', response => {
      if (response.status() >= 400 && new URL(response.url()).origin === origin) {
        errors.push({ kind: 'http', status: response.status(), url: response.url() })
      }
    })
    page.on('requestfailed', request => {
      if (new URL(request.url()).origin === origin && request.failure()?.errorText !== 'net::ERR_ABORTED') {
        errors.push({ kind: 'requestfailed', url: request.url(), message: request.failure()?.errorText })
      }
    })
    const readState = async () => {
      const state = await page.evaluate(() => {
        if (window.__experimentTest) return { source: 'data-writer', ...window.__experimentTest.snapshot() }
        return { source: 'console', events: window.__experimentConsoleEvents ?? [] }
      })
      events.splice(0, events.length, ...state.events)
      return { ...state, errors: [...errors], blockedRequests: [...blockedRequests] }
    }
    return {
      browser, context, page, url, errors, events, blockedRequests,
      readState,
      readEvents: async () => (await readState()).events,
      flush: async () => {},
      close: () => browser.close(),
    }
  } catch (error) {
    await browser.close()
    throw error
  }
}
