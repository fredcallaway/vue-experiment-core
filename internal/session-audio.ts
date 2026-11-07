import type { SessionData } from './data'
import { audioFilename, isAudioFile } from './audio-file'

export type SessionAudio = {
  sessionId: string
  participantId: string
  path: string
  bucket: string
  filename: string
  contentType: string
  size?: number
  durationMs?: number
  epoch?: string
}

export function sessionAudio(session: SessionData, defaultBucket: string): SessionAudio[] {
  const files = new Map<string, SessionAudio>()
  const add = (path: string, bucket: string, contentType: string, size?: number, epoch?: string,
    durationMs?: unknown) => {
    const filename = audioFilename(path)
    const isAudio = contentType.startsWith('audio/') || ((!contentType || contentType === 'application/octet-stream')
      && /\.(webm|m4a|mp3|mp4|ogg|wav|flac|aac|opus)$/i.test(filename))
    const key = `${bucket}/${path}`
    if (!isAudio) return
    const duration = typeof durationMs === 'number' && Number.isFinite(durationMs) && durationMs > 0
      ? durationMs : undefined
    const existing = files.get(key)
    if (existing) {
      existing.size ??= size
      existing.epoch ??= epoch
      existing.durationMs = duration ?? existing.durationMs
      if (existing.contentType === 'audio/*' && contentType) existing.contentType = contentType
      return
    }
    files.set(key, { sessionId: session.meta.sessionId, participantId: session.meta.participantId,
      path, bucket, filename, contentType, size, durationMs: duration, epoch })
  }
  const visit = (value: unknown, epoch?: string, durationMs?: unknown) => {
    if (!value || typeof value !== 'object') return
    const item = value as Record<string, unknown>
    if (isAudioFile(item)) {
      add(item.path, item.bucket, 'audio/*', undefined, epoch)
      return
    }
    if (item.saved === true && typeof item.path === 'string' && typeof item.contentType === 'string') {
      add(item.path, typeof item.bucket === 'string' ? item.bucket : defaultBucket, item.contentType,
        typeof item.size === 'number' ? item.size : undefined, epoch, item.durationMs ?? durationMs)
    }
    // Preserve access to existing fluency recordings without rewriting raw session data.
    if (typeof item.audio_path === 'string' && item.saved_remotely !== false) {
      add(item.audio_path, defaultBucket, typeof item.audio_mime_type === 'string' ? item.audio_mime_type : '',
        typeof item.audio_bytes === 'number' ? item.audio_bytes : undefined, epoch, item.durationMs)
    }
    Object.values(item).forEach(child => visit(child, epoch))
  }
  // Older audio trials logged duration on the recording event before saving the file.
  const recorded = new Map<string, SessionData['events'][number]['data']>()
  for (const { data, currentEpochId, eventType } of session.events) {
    const match = eventType?.match(/^(.+)\.(recorded|saved)$/)
    const key = `${currentEpochId}/${match?.[1]}`
    if (match?.[2] === 'recorded') recorded.set(key, data)
    const attempt = match?.[2] === 'saved' ? recorded.get(key) : undefined
    const durationMs = typeof attempt?.bytes === 'number' && attempt.bytes === data.size
      ? attempt.durationMs : undefined
    visit(data, currentEpochId, durationMs)
  }
  visit(session.other?.files)
  return [...files.values()]
}
