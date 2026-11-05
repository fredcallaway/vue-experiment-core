import { expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'

test('session uploads isolate previews, require a writable session, and await Firebase acknowledgement', () => {
  // Isolate SDK mocks and global session state from every other test.
  const result = spawnSync(process.execPath, ['--eval', `
    import { strict as assert } from 'node:assert'
    import { mock } from 'bun:test'
    const session = { mode: 'debug', sessionId: 'session/1', participantId: 'p', studyId: 's', version: 'v' }
    const registered = []
    const writer = { initialized: false, writable: true, sessionId: session.sessionId,
      updateOther: (path, file) => registered.push({ path, file }) }
    const jumping = { value: false }
    const config = { storageBucket: 'test.invalid' }
    let initialized = 0, signedIn = 0, uploads = [], acknowledge, failAuth = false
    const auth = { currentUser: null, authStateReady: async () => {} }
    mock.module('~/firebase.config.json', () => ({ default: config }))
    mock.module('firebase/app', () => ({ initializeApp: () => { initialized++; return {} } }))
    mock.module('firebase/auth', () => ({ getAuth: () => auth, signInAnonymously: async () => {
      signedIn++
      if (failAuth) throw new Error('Auth denied')
      auth.currentUser = { uid: 'uid1' }
      return { user: auth.currentUser }
    } }))
    mock.module('firebase/storage', () => ({ getStorage: () => ({}), ref: (_storage, path) => path,
      uploadBytes: async (path, blob, metadata) => {
        uploads.push({ path, blob, metadata })
        await new Promise((resolve, reject) => { acknowledge = { resolve, reject } })
        return { metadata: { fullPath: path, bucket: config.storageBucket, size: blob.size,
          contentType: metadata.contentType } }
      }
    }))
    mock.module('./useCurrentSession', () => ({ useCurrentSession: () => session }))
    mock.module('./useDataWriter', () => ({ useDataWriter: () => writer }))
    mock.module('../internal/state', () => ({ isJumping: jumping }))
    const { useFirebaseStorage, MAX_UPLOAD_BYTES } = await import('./useFirebaseStorage.ts')
    const { upload } = useFirebaseStorage()
    const blob = new Blob(['audio'], { type: 'audio/webm;codecs=opus' })
    assert.deepEqual(await upload('clip.webm', blob), { saved: false, path: null })
    assert.equal(initialized, 0)
    writer.initialized = true
    const paths = []
    for (const mode of ['debug', 'live']) {
      session.mode = mode
      auth.currentUser = null; signedIn = 0; uploads = []; registered.length = 0
      const previousInitializations = initialized
      jumping.value = true
      assert.deepEqual(await upload('clip.webm', blob), { saved: false, path: null })
      assert.equal(initialized, previousInitializations)
      jumping.value = false; writer.writable = false
      await assert.rejects(upload('clip.webm', blob), /active, initialized/)
      writer.writable = true; writer.sessionId = 'other'
      await assert.rejects(upload('clip.webm', blob), /active, initialized/)
      writer.sessionId = session.sessionId
      for (const name of ['', '..', '../clip', 'clip/file', 'clip\\\\file']) {
        await assert.rejects(upload(name, blob), /filename/)
      }
      await assert.rejects(upload('empty', new Blob([])), /size/)
      await assert.rejects(upload('large', new Blob([new Uint8Array(MAX_UPLOAD_BYTES + 1)])), /size/)
      config.storageBucket = ''
      await assert.rejects(upload('clip.webm', blob), /storageBucket/)
      config.storageBucket = 'test.invalid'; failAuth = true
      await assert.rejects(upload('clip.webm', blob), /Auth denied/)
      failAuth = false
      let settled = false
      const pending = upload('clip one.webm', blob).then(value => { settled = true; return value })
      while (!uploads.length) await new Promise(resolve => setTimeout(resolve, 1))
      assert.equal(settled, false)
      acknowledge.reject(new Error('Network failed'))
      await assert.rejects(pending, /Network failed/)
      assert.equal(registered.length, 0, 'failed uploads must not enter the session file index')
      const retry = upload('clip one.webm', blob)
      while (uploads.length < 2) await new Promise(resolve => setTimeout(resolve, 1))
      assert.equal(uploads[0].path, uploads[1].path)
      assert.equal(uploads[1].path, mode === 'debug'
        ? 'sessions/uid1/debug.session%2F1/clip%20one.webm' : 'sessions/uid1/session%2F1/clip%20one.webm')
      paths.push(uploads[1].path)
      assert.equal(uploads[1].metadata.contentType, 'audio/webm')
      assert.deepEqual(uploads[1].metadata.customMetadata, {
        sessionId: session.sessionId, participantId: 'p', studyId: 's', version: 'v', mode
      })
      acknowledge.resolve()
      assert.deepEqual(await retry, { saved: true, path: uploads[1].path, bucket: 'test.invalid',
        size: blob.size, contentType: 'audio/webm' })
      assert.deepEqual(registered, [{ path: 'files/clip%20one%2Ewebm', file: {
        saved: true, path: uploads[1].path, bucket: 'test.invalid', size: blob.size, contentType: 'audio/webm'
      } }])
      assert.equal(signedIn, 2, 'failed authentication can retry; successful identity is reused')
      const superseded = upload('clip two.webm', blob)
      while (uploads.length < 3) await new Promise(resolve => setTimeout(resolve, 1))
      writer.writable = false
      acknowledge.resolve()
      await assert.rejects(superseded, /active, initialized/)
      assert.equal(registered.length, 1, 'a superseded upload must not enter the session file index')
      writer.writable = true
    }
    assert.notEqual(paths[0], paths[1], 'debug files must not overwrite live files for the same session')
    session.mode = 'live'; writer.initialized = false; writer.writable = false
    await assert.rejects(upload('clip.webm', blob), /active, initialized/)
  `], { cwd: new URL('.', import.meta.url), encoding: 'utf8', timeout: 15000 })
  expect(result.stderr + result.stdout).not.toContain('AssertionError')
  expect(result.status).toBe(0)
})
