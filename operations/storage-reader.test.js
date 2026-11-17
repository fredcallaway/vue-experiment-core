import { test, vi } from 'vitest'
import { strict as assert } from 'node:assert'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { generateKeyPairSync } from 'node:crypto'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import * as h3 from 'h3'

test('local playback streams authenticated audio and byte ranges without exposing Storage credentials', async () => {
  Object.assign(globalThis, h3)
  const roots = []
  const createRoot = async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'storage-read-test-'))
    roots.push(root)
    execFileSync('git', ['init', '-q'], { cwd: root })
    await writeFile(resolve(root, 'firebase.config.json'), JSON.stringify({
      projectId: 'audio-test', storageBucket: 'audio-test.invalid'
    }))
    return root
  }
  let status = 200, type = 'audio/webm', accesses = 0
  const upstreamCalls = []
  vi.doMock('google-auth-library', () => ({ GoogleAuth: class {
    constructor(options) {
      assert.equal(options.credentials.project_id, 'audio-test')
      assert.deepEqual(options.scopes, ['https://www.googleapis.com/auth/devstorage.read_only'])
    }
    async getAccessToken() { accesses++; return 'PRIVATE_TEST_TOKEN' }
  } }))
  const nativeFetch = globalThis.fetch
  globalThis.fetch = async (url, options) => {
    if (!String(url).startsWith('https://storage.googleapis.com/')) return nativeFetch(url, options)
    upstreamCalls.push({ url, options })
    return new Response(new Uint8Array([1, 2, 3]), { status, headers: {
      'Content-Type': type, 'Content-Length': '3', 'Accept-Ranges': 'bytes',
      ...(status === 206 ? { 'Content-Range': 'bytes 0-2/30' } : {}),
      'x-private-upstream': 'PRIVATE_TEST_TOKEN',
    } })
  }
  const module = await import('./storage-reader.ts')
  const { configureFirebaseCredentials } = await import('./firebase-auth.ts')
  const route = (await import('../server/api/recordings.get.ts')).default
  const cwd = process.cwd()
  let server
  try {
    const root = await createRoot()
    vi.stubEnv('HOME', root)
    const key = resolve(root, 'key.json')
    await writeFile(key, JSON.stringify({ type: 'service_account', project_id: 'audio-test',
      client_email: 'test@audio-test.invalid', private_key: generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }) }))
    const configured = await configureFirebaseCredentials(root, key)
    process.chdir(root)
    const app = h3.createApp().use('/api/recordings', route)
    server = createServer(h3.toNodeListener(app))
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    const url = new URL('http://127.0.0.1:' + server.address().port + '/api/recordings')
    url.searchParams.set('bucket', 'audio-test.invalid')
    url.searchParams.set('path', 'sessions/uid/s1/clip%20one.webm')
    const audio = await nativeFetch(url)
    assert.equal(audio.status, 200)
    assert.deepEqual([...new Uint8Array(await audio.arrayBuffer())], [1, 2, 3])
    assert.equal(audio.headers.get('content-type'), 'audio/webm')
    assert.equal(audio.headers.get('cache-control'), 'private, no-store')
    assert.equal(audio.headers.get('x-private-upstream'), null)
    assert.equal(upstreamCalls[0].options.headers.get('Authorization'), 'Bearer PRIVATE_TEST_TOKEN')
    assert.ok(upstreamCalls[0].url.endsWith('/o/sessions%2Fuid%2Fs1%2Fclip%2520one.webm?alt=media'))
    assert.equal(upstreamCalls[0].options.redirect, 'error')
    status = 206
    const ranged = await nativeFetch(url, { headers: { Range: 'bytes=0-2' } })
    assert.equal(ranged.status, 206)
    assert.equal(ranged.headers.get('content-range'), 'bytes 0-2/30')
    assert.equal(upstreamCalls.at(-1).options.headers.get('Range'), 'bytes=0-2')
    await ranged.arrayBuffer()
    const count = accesses
    const denied = await nativeFetch(url, { headers: { Origin: 'https://other.invalid' } })
    assert.equal(denied.status, 403)
    assert.equal(accesses, count)
    await denied.text()
    for (const request of [
      { hostname: 'other.invalid', remoteAddress: '127.0.0.1' },
      { hostname: 'localhost', remoteAddress: '10.0.0.1' },
      { hostname: 'localhost', remoteAddress: '::1', fetchSite: 'same-site' },
    ]) assert.throws(() => module.assertLocalStorageRequest({ origin: 'http://localhost', ...request }))
    const file = { bucket: 'audio-test.invalid', path: 'clip.webm' }
    await assert.rejects(module.readStorageAudio(root, { ...file, bucket: 'another.invalid' }), /configured/)
    await assert.rejects(module.readStorageAudio(root, { ...file, range: 'bytes=-' }), /range/)
    status = 403
    await assert.rejects(module.readStorageAudio(root, file), /Storage Object Viewer/)
    status = 404
    await assert.rejects(module.readStorageAudio(root, file), /not found/)
    status = 200; type = 'text/html'
    const unsafeType = await module.readStorageAudio(root, file)
    assert.equal(unsafeType.headers.get('Content-Type'), 'application/octet-stream')
    assert.equal(unsafeType.headers.get('Content-Disposition'), 'attachment')
    await unsafeType.arrayBuffer()
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS
    await rm(configured.credentialFile)
    const unconfigured = await createRoot()
    await assert.rejects(module.readStorageAudio(unconfigured, file), /firebase-auth configure/)
  } finally {
    process.chdir(cwd)
    vi.unstubAllEnvs()
    if (server) await new Promise(resolve => server.close(resolve))
    await Promise.all(roots.map(root => rm(root, { recursive: true, force: true })))
  }
})
