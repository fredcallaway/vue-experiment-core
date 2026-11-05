import { computed, onScopeDispose, readonly, ref, shallowRef } from 'vue'

export type AudioRecording = {
  blob: Blob
  durationMs: number
  mimeType: string
  extension: string
}

export type AudioRecorderOptions = {
  audio?: boolean | MediaTrackConstraints
  mimeType?: string
  audioBitsPerSecond?: number
}

export function useAudioRecorder(options: AudioRecorderOptions = {}) {
  const supported = computed(() => typeof window !== 'undefined' && window.isSecureContext
    && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined')
  const status = ref<'idle' | 'requesting' | 'recording' | 'stopping' | 'ready' | 'error'>('idle')
  const recording = shallowRef<AudioRecording | null>(null)
  const playbackUrl = ref('')
  const error = shallowRef<Error | null>(null)
  let generation = 0
  let disposed = false
  let stream: MediaStream | undefined
  let recorder: MediaRecorder | undefined
  let completion: Promise<AudioRecording> | undefined
  let rejectPending = (_error: Error) => {}
  let stoppedAt: number | undefined

  function releaseTracks() {
    stream?.getTracks().forEach(track => track.stop())
    stream = undefined
  }

  function clearPlayback() {
    if (playbackUrl.value) URL.revokeObjectURL(playbackUrl.value)
    playbackUrl.value = ''
    recording.value = null
  }

  function cancel() {
    generation++
    rejectPending(new DOMException('Recording cancelled.', 'AbortError'))
    rejectPending = () => {}
    if (recorder && recorder.state !== 'inactive') recorder.stop()
    recorder = undefined
    releaseTracks()
    clearPlayback()
    completion = undefined
    error.value = null
    status.value = 'idle'
  }

  async function start(): Promise<void> {
    if (disposed) throw new Error('This audio recorder has been disposed.')
    if (['requesting', 'recording', 'stopping'].includes(status.value)) {
      throw new Error('A recording is already in progress.')
    }
    if (!supported.value) throw new Error('Microphone recording requires HTTPS and a supported browser.')
    if (options.audio === false) throw new Error('Audio capture must be enabled.')
    cancel()
    const attempt = generation
    status.value = 'requesting'
    try {
      const acquired = await navigator.mediaDevices.getUserMedia({ audio: options.audio ?? true })
      // Permission may be granted after navigation or cancellation.
      if (attempt !== generation) {
        acquired.getTracks().forEach(track => track.stop())
        throw new DOMException('Recording cancelled.', 'AbortError')
      }
      stream = acquired
      const mimeType = options.mimeType ?? ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus']
        .find(type => MediaRecorder.isTypeSupported(type))
      if (mimeType && !MediaRecorder.isTypeSupported(mimeType)) {
        throw new Error(`Unsupported recording format: ${mimeType}`)
      }
      const current = new MediaRecorder(acquired, { mimeType, audioBitsPerSecond: options.audioBitsPerSecond })
      recorder = current
      const chunks: Blob[] = []
      let startedAt = 0
      stoppedAt = undefined
      let resolveRecording!: (value: AudioRecording) => void
      let rejectRecording!: (cause: Error) => void
      completion = new Promise((resolve, reject) => { resolveRecording = resolve; rejectRecording = reject })
      // Device failure can precede the caller's stop(); keep that rejection available for stop().
      void completion.catch(() => {})
      await new Promise<void>((resolve, reject) => {
        rejectPending = cause => { reject(cause); rejectRecording(cause) }
        const fail = (cause: Error) => {
          if (attempt !== generation) return
          error.value = cause
          status.value = 'error'
          rejectPending(cause)
          releaseTracks()
          if (current.state !== 'inactive') current.stop()
        }
        current.ondataavailable = event => {
          if (attempt === generation && event.data.size) chunks.push(event.data)
        }
        current.onstart = () => {
          if (attempt !== generation) return
          startedAt = performance.now()
          status.value = 'recording'
          resolve()
        }
        current.onerror = () => fail(new Error('Audio recording failed. Please try again.'))
        current.onstop = () => {
          if (attempt !== generation || status.value === 'error') return
          const durationMs = Math.max(0, Math.round((stoppedAt ?? performance.now()) - startedAt))
          releaseTracks()
          const type = current.mimeType || chunks[0]?.type || ''
          const blob = new Blob(chunks, { type })
          if (!blob.size) return fail(new Error('The recording is empty. Please try again.'))
          const extension = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg'
            : type.includes('webm') ? 'webm' : type.includes('wav') ? 'wav' : 'bin'
          const result = { blob, durationMs, mimeType: type, extension }
          recording.value = result
          playbackUrl.value = URL.createObjectURL(blob)
          status.value = 'ready'
          rejectPending = () => {}
          resolveRecording(result)
        }
        current.start(1000)
      })
    } catch (cause) {
      if (attempt === generation) {
        releaseTracks()
        error.value = cause instanceof Error ? cause : new Error(String(cause))
        rejectPending(error.value)
        status.value = 'error'
      }
      throw cause
    }
  }

  function stop(): Promise<AudioRecording> {
    if (!completion) return Promise.reject(new Error('No recording has started.'))
    if (status.value === 'recording' && recorder) {
      status.value = 'stopping'
      stoppedAt = performance.now()
      if (recorder.state !== 'inactive') recorder.stop()
    }
    return completion
  }

  onScopeDispose(() => { cancel(); disposed = true })
  return { supported, status: readonly(status), recording: readonly(recording), playbackUrl: readonly(playbackUrl),
    error: readonly(error), start, stop, cancel }
}
