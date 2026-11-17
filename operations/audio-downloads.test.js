import { expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'

test('data saving backfills missing audio, skips existing files, and retries incomplete downloads', () => {
  const result = spawnSync(process.execPath, ['--eval', `
    import assert from 'node:assert/strict'
    import { mock } from 'bun:test'
    import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, stat } from 'node:fs/promises'
    import { tmpdir } from 'node:os'
    import { resolve, dirname } from 'node:path'
    import { createServer } from 'node:http'
    import * as h3 from 'h3'
    Object.assign(globalThis, h3)
    const root = await mkdtemp(resolve(tmpdir(), 'audio-download-test-'))
    const cwd = process.cwd()
    const reads = []
    let failure = '', incomplete = false
    mock.module('./storage-reader.ts', () => ({ readStorageAudio: async (_root, file) => {
      reads.push(file.path)
      if (failure) throw new Error(failure)
      return new Response(new Uint8Array(incomplete ? [1] : [1, 2, 3]))
    } }))
    mock.module('~/firebase.config.json', () => ({ default: {
      databaseURL: 'https://database.invalid', storageBucket: 'audio.invalid',
    } }))
    const descriptor = name => ({ saved: true, bucket: 'audio.invalid',
      path: 'sessions/uid/s1/' + name, size: 3, contentType: 'audio/webm' })
    const a = descriptor('audio-a.webm'), b = descriptor('audio-b.webm')
    const session = (id, mode = 'live', version = 'v1') => ({
      meta: { sessionId: id, participantId: 'p', studyId: '', mode, version,
        startTime: 1, lastUpdateTime: 2, bonus: 0, assignment: 0 },
      events: [{ eventType: 'audio.saved', data: a }], other: { files: { a } }, _downloadTime: 100,
    })
    const s1 = session('s1'), s2 = session('s2', 'live', 'v2')
    const raw = resolve(root, 'data/raw/live')
    await mkdir(raw, { recursive: true })
    for (const s of [s1, s2]) await writeFile(resolve(raw, s.meta.sessionId + '.json'), JSON.stringify(s))
    await writeFile(resolve(raw, '_meta.json'), JSON.stringify({
      s1: { ...s1.meta, _downloadTime: 100 }, s2: { ...s2.meta, _downloadTime: 100 },
    }))
    const db = { live: { meta: { s1: s1.meta, s2: s2.meta } } }
    const databaseReads = []
    globalThis.$fetch = async url => {
      databaseReads.push(url)
      return structuredClone(new URL(url).pathname.split('/').filter(Boolean)
        .map(x => x.replace(/\\.json$/, '')).reduce((value, key) => value?.[key], db) ?? null)
    }
    let server
    try {
      process.chdir(root)
      const route = (await import(
        ${JSON.stringify(new URL('../server/api/syncData.ts', import.meta.url).pathname)}
      )).default
      const { downloadSessionAudio } = await import(
        ${JSON.stringify(new URL('./audio-downloads.ts', import.meta.url).pathname)}
      )
      server = createServer(h3.toNodeListener(h3.createApp().use('/api/syncData', route)))
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
      const url = 'http://127.0.0.1:' + server.address().port + '/api/syncData'
      const sync = async body => {
        const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'live', ...body }) })
        return { status: response.status, data: await response.json() }
      }
      assert.equal((await sync({})).data.numUpdated, 0)
      assert.equal(reads.length, 0, 'Browsing data must not download audio')
      const first = await sync({ includeAudio: true, version: 'v1' })
      assert.equal(first.status, 200)
      assert.equal(first.data.numUpdated, 0, 'Backfill audio for sessions already saved locally')
      assert.equal(first.data.audioDownloaded, 1)
      assert.equal(first.data.audioSkipped, 0)
      assert.equal(reads.length, 1, 'Duplicate event and index references download once')
      const target = resolve(raw, 'audio', a.path)
      assert.deepEqual([...await readFile(target)], [1, 2, 3])
      const before = await stat(target)
      const second = await sync({ includeAudio: true, version: 'v1' })
      assert.equal(second.data.audioDownloaded, 0)
      assert.equal(second.data.audioSkipped, 1)
      assert.equal(reads.length, 1, 'Existing recordings do not contact Storage')
      assert.equal((await stat(target)).mtimeMs, before.mtimeMs)
      assert.deepEqual(databaseReads, Array(databaseReads.length).fill('https://database.invalid/live/meta.json'),
        'Cached raw sessions do not refetch events or file indexes')

      s1.other.files.b = b
      await writeFile(resolve(raw, 's1.json'), JSON.stringify(s1))
      failure = 'Storage access failed'
      assert.equal((await sync({ includeAudio: true, sessionId: 's1' })).status, 500)
      assert.equal(await stat(resolve(raw, 'audio', b.path)).catch(() => null), null)
      failure = ''; incomplete = true
      assert.equal((await sync({ includeAudio: true, sessionId: 's1' })).status, 500)
      assert.equal((await readdir(dirname(target))).some(name => name.endsWith('.part')), false)
      incomplete = false
      const retry = await sync({ includeAudio: true, sessionId: 's1' })
      assert.equal(retry.data.audioDownloaded, 1)
      assert.equal(retry.data.audioSkipped, 1)
      assert.deepEqual([...await readFile(resolve(raw, 'audio', b.path))], [1, 2, 3])
      const count = reads.length
      await sync({ includeAudio: true, sessionId: 's1' })
      assert.equal(reads.length, count)
      const debug = await downloadSessionAudio(root, 'debug', s1, 'audio.invalid')
      assert.equal(debug.downloaded, 2)
      assert.deepEqual([...await readFile(resolve(root, 'data/raw/debug/audio', a.path))], [1, 2, 3])
      for (const path of ['../outside.webm', '/absolute.webm', 'sessions/../../outside.webm', 'bad\\\\path.webm']) {
        const invalid = { ...s1, events: [], other: { files: { bad: { ...a, path } } } }
        await assert.rejects(downloadSessionAudio(root, 'live', invalid, 'audio.invalid'), /invalid/)
      }
      await assert.rejects(downloadSessionAudio(root, 'live', s1, 'another.invalid'), /configured/)
      assert.equal((await sync({ includeAudio: 'yes' })).status, 400)
    } finally {
      if (server) await new Promise(resolve => server.close(resolve))
      process.chdir(cwd)
      await rm(root, { recursive: true, force: true })
    }
  `], { cwd: new URL('.', import.meta.url), encoding: 'utf8', timeout: 30000 })
  if (result.status !== 0) console.error(result.stderr + result.stdout)
  expect(result.status).toBe(0)
})
