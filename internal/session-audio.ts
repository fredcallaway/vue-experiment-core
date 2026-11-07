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
  epoch?: string
}

export function sessionAudio(session: SessionData, defaultBucket: string): SessionAudio[] {
  const files = new Map<string, SessionAudio>()
  const add = (path: string, bucket: string, contentType: string, size?: number, epoch?: string) => {
    const filename = audioFilename(path)
    const isAudio = contentType.startsWith('audio/') || ((!contentType || contentType === 'application/octet-stream')
      && /\.(webm|m4a|mp3|mp4|ogg|wav|flac|aac|opus)$/i.test(filename))
    const key = `${bucket}/${path}`
    if (!isAudio) return
    const existing = files.get(key)
    if (existing) {
      existing.size ??= size
      existing.epoch ??= epoch
      if (existing.contentType === 'audio/*' && contentType) existing.contentType = contentType
      return
    }
    files.set(key, { sessionId: session.meta.sessionId, participantId: session.meta.participantId,
      path, bucket, filename, contentType, size, epoch })
  }
  const visit = (value: unknown, epoch?: string) => {
    if (!value || typeof value !== 'object') return
    const item = value as Record<string, unknown>
    if (isAudioFile(item)) {
      add(item.path, item.bucket, 'audio/*', undefined, epoch)
      return
    }
    if (item.saved === true && typeof item.path === 'string' && typeof item.contentType === 'string') {
      add(item.path, typeof item.bucket === 'string' ? item.bucket : defaultBucket, item.contentType,
        typeof item.size === 'number' ? item.size : undefined, epoch)
    }
    // Preserve access to existing fluency recordings without rewriting raw session data.
    if (typeof item.audio_path === 'string' && item.saved_remotely !== false) {
      add(item.audio_path, defaultBucket, typeof item.audio_mime_type === 'string' ? item.audio_mime_type : '',
        typeof item.audio_bytes === 'number' ? item.audio_bytes : undefined, epoch)
    }
    Object.values(item).forEach(child => visit(child, epoch))
  }
  session.events.forEach(event => visit(event.data, event.currentEpochId))
  visit(session.other?.files)
  return [...files.values()]
}
