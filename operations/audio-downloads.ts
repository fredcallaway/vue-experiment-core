import { createWriteStream } from 'node:fs'
import { mkdir, rename, rm, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { ReadableStream } from 'node:stream/web'
import type { DataMode, SessionData } from '../internal/data'
import { localAudioPath } from '../internal/audio-file'
import { sessionAudio } from '../internal/session-audio'
import { readStorageAudio } from './storage-reader'

export async function downloadSessionAudio(root: string, mode: DataMode, session: SessionData, bucket: string) {
  let downloaded = 0
  let skipped = 0
  for (const file of sessionAudio(session, bucket)) {
    if (file.bucket !== bucket) throw new Error('Recording is not in the configured Storage bucket.')
    const target = resolve(root, 'data', localAudioPath(mode, file.path))
    const existing = await stat(target).catch(error => {
      if (error.code !== 'ENOENT') throw error
      return null
    })
    if (existing?.isFile() && existing.size > 0 && (file.size === undefined || existing.size === file.size)) {
      skipped++
      continue
    }

    const { body } = await readStorageAudio(root, file)
    if (!(body instanceof ReadableStream)) throw new Error('Recording download returned no data.')
    await mkdir(dirname(target), { recursive: true })
    const temporary = `${target}.${randomUUID()}.part`
    try {
      await pipeline(Readable.fromWeb(body), createWriteStream(temporary, { flags: 'wx', mode: 0o600 }))
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
