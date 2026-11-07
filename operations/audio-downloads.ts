import { createWriteStream } from 'node:fs'
import { mkdir, rename, rm, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { DataMode, SessionData } from '../internal/data'
import { sessionAudio } from '../internal/session-audio'
import { readStorageAudio } from './storage-reader'

export async function downloadSessionAudio(root: string, mode: DataMode, session: SessionData, bucket: string) {
  let downloaded = 0
  let skipped = 0
  for (const file of sessionAudio(session, bucket)) {
    if (file.bucket !== bucket) throw new Error('Recording is not in the configured Storage bucket.')
    const segments = file.path.split('/')
    if (segments.some(part => !part || part === '.' || part === '..' || /[\\\x00-\x1f]/.test(part))) {
      throw new Error('Recording path contains an invalid directory or filename.')
    }
    const target = resolve(root, 'data/raw', mode, 'audio', ...segments)
    const existing = await stat(target).catch(error => {
      if (error.code !== 'ENOENT') throw error
      return null
    })
    if (existing?.isFile() && existing.size > 0 && (file.size === undefined || existing.size === file.size)) {
      skipped++
      continue
    }

    const response = await readStorageAudio(root, file)
    if (!response.body) throw new Error('Recording download returned no data.')
    await mkdir(dirname(target), { recursive: true })
    const temporary = `${target}.${randomUUID()}.part`
    try {
      await pipeline(Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
        createWriteStream(temporary, { flags: 'wx', mode: 0o600 }))
      const { size } = await stat(temporary)
      if (!size || (file.size !== undefined && size !== file.size)) {
        throw new Error(`Recording download has an unexpected size: ${file.filename}`)
      }
      await rename(temporary, target)
      downloaded++
    } finally {
      await rm(temporary, { force: true })
    }
  }
  return { downloaded, skipped }
}
