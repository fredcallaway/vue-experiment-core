import type { DataMode, SafeData } from './data'

export type AudioFile = { type: 'audio'; bucket: string; path: string }

export function audioFile({ bucket, path }: Pick<AudioFile, 'bucket' | 'path'>): AudioFile {
  return { type: 'audio', bucket, path }
}

export function isAudioFile(value: unknown): value is AudioFile {
  return !!value && typeof value === 'object' && 'type' in value && value.type === 'audio'
    && 'bucket' in value && typeof value.bucket === 'string' && 'path' in value && typeof value.path === 'string'
}

export function audioFilename(path: string): string {
  const name = path.split('/').pop() || path
  try { return decodeURIComponent(name) } catch { return name }
}

export function localAudioPath(mode: DataMode, path: string): string {
  if (path.split('/').some(part => !part || part === '.' || part === '..' || /[\\\x00-\x1f]/.test(part))) {
    throw new Error('Recording path contains an invalid directory or filename.')
  }
  return `raw/${mode}/audio/${path}`
}

// Processed view files are in data/processed/<mode>/<version or session>/.
export function exportAudioFiles(value: SafeData, mode: DataMode): SafeData {
  if (isAudioFile(value)) return `../../../${localAudioPath(mode, value.path)}`
  if (Array.isArray(value)) return value.map(item => exportAudioFiles(item, mode))
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, exportAudioFiles(item, mode)]))
  }
  return value
}
