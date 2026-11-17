import { afterEach, beforeEach, expect, test } from 'vitest'
import { effectScope } from 'vue'
import { useAudioRecorder } from './useAudioRecorder'

let scopes, tracks, recorders, revoked, nextStream, empty, startError
const originalWindow = globalThis.window
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
const originalRecorder = globalThis.MediaRecorder
const originalCreate = URL.createObjectURL
const originalRevoke = URL.revokeObjectURL

function stream() {
  const track = { stopped: false, stop() { this.stopped = true } }
  tracks.push(track)
  return { getTracks: () => [track] }
}

beforeEach(() => {
  scopes = []; tracks = []; recorders = []; revoked = []
  nextStream = undefined; empty = false; startError = false
  globalThis.window = { isSecureContext: true }
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true, value: { mediaDevices: { getUserMedia: () => nextStream ?? Promise.resolve(stream()) } },
  })
  globalThis.MediaRecorder = class {
    state = 'inactive'
    mimeType = 'audio/webm;codecs=opus'
    static isTypeSupported(type) { return type.startsWith('audio/webm') }
    constructor() { recorders.push(this) }
    start() {
      if (startError) throw new Error('Could not start device')
      this.state = 'recording'
      queueMicrotask(() => this.onstart?.())
    }
    stop() {
      this.state = 'inactive'
      queueMicrotask(() => {
        this.ondataavailable?.({ data: new Blob(empty ? [] : ['final bytes'], { type: this.mimeType }) })
        this.onstop?.()
      })
    }
  }
  URL.createObjectURL = () => `blob:test-${recorders.length}`
  URL.revokeObjectURL = url => revoked.push(url)
})

afterEach(() => {
  scopes.forEach(scope => scope.stop())
  globalThis.window = originalWindow
  if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator)
  else delete globalThis.navigator
  globalThis.MediaRecorder = originalRecorder
  URL.createObjectURL = originalCreate
  URL.revokeObjectURL = originalRevoke
})

function setup() {
  const scope = effectScope()
  scopes.push(scope)
  return { scope, audio: scope.run(() => useAudioRecorder()) }
}

test('stop waits for the final bytes, returns one result, and releases the microphone', async () => {
  const { audio, scope } = setup()
  await audio.start()
  expect(audio.status.value).toBe('recording')
  const stopped = audio.stop()
  expect(audio.recording.value).toBeNull()
  expect(audio.stop()).toBe(stopped)
  const result = await stopped
  expect(await result.blob.text()).toBe('final bytes')
  expect(result.mimeType).toBe(recorders[0].mimeType)
  expect(result.extension).toBe('webm')
  expect(result.durationMs).toBeGreaterThanOrEqual(0)
  expect(tracks.every(track => track.stopped)).toBe(true)
  expect(audio.status.value).toBe('ready')
  scope.stop()
  expect(revoked).toEqual(['blob:test-1'])
})

test('a late permission grant after disposal stops its tracks and creates no recorder', async () => {
  const { audio, scope } = setup()
  let grant
  nextStream = new Promise(resolve => { grant = resolve })
  const started = audio.start()
  scope.stop()
  grant(stream())
  await expect(started).rejects.toHaveProperty('name', 'AbortError')
  expect(tracks.every(track => track.stopped)).toBe(true)
  expect(recorders).toHaveLength(0)
  expect(audio.recording.value).toBeNull()
})

test('permission denial is retryable', async () => {
  const { audio } = setup()
  nextStream = Promise.reject(new DOMException('Denied', 'NotAllowedError'))
  await expect(audio.start()).rejects.toHaveProperty('name', 'NotAllowedError')
  expect(audio.status.value).toBe('error')
  nextStream = undefined
  await audio.start()
  expect((await audio.stop()).blob.size).toBeGreaterThan(0)
})

test('empty recordings and recorder errors reject and release all tracks', async () => {
  const { audio } = setup()
  await audio.start()
  empty = true
  await expect(audio.stop()).rejects.toThrow('empty')
  expect(audio.recording.value).toBeNull()
  empty = false
  await audio.start()
  recorders.at(-1).onerror()
  await expect(audio.stop()).rejects.toThrow('failed')
  expect(audio.recording.value).toBeNull()
  expect(tracks.every(track => track.stopped)).toBe(true)
})

test('a failed start releases tracks; cancellation and rerecording discard old playback', async () => {
  const { audio } = setup()
  startError = true
  await expect(audio.start()).rejects.toThrow('Could not start')
  expect(tracks.every(track => track.stopped)).toBe(true)
  startError = false
  await audio.start()
  await expect(audio.start()).rejects.toThrow('already')
  await audio.stop()
  await audio.start()
  expect(revoked).toEqual(['blob:test-2'])
  audio.cancel()
  await Promise.resolve()
  expect(audio.status.value).toBe('idle')
  expect(audio.recording.value).toBeNull()
  expect(tracks.every(track => track.stopped)).toBe(true)
})
