import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { GoogleAuth } from 'google-auth-library'
import { firebaseEnvironment } from './firebase-auth'

export class StorageReadError extends Error {
  constructor(readonly statusCode: number, message: string) { super(message) }
}

export function assertLocalStorageRequest(request: {
  hostname: string; origin: string; remoteAddress?: string; requestOrigin?: string; fetchSite?: string
}) {
  const localHost = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(request.hostname)
  const localPeer = request.remoteAddress === '::1' || request.remoteAddress === '127.0.0.1'
    || request.remoteAddress === '::ffff:127.0.0.1'
  if (!localHost || !localPeer || (request.fetchSite && !['same-origin', 'none'].includes(request.fetchSite))
    || (request.requestOrigin && request.requestOrigin !== request.origin)) {
    throw new StorageReadError(403, 'Recording playback is available only through the local Data dashboard.')
  }
}

export async function readStorageAudio(root: string, file: { bucket: string; path: string; range?: string }) {
  const config = JSON.parse(await readFile(resolve(root, 'firebase.config.json'), 'utf8'))
  if (!config.storageBucket) throw new StorageReadError(503, 'Set storageBucket in firebase.config.json.')
  if (file.bucket !== config.storageBucket) {
    throw new StorageReadError(403, 'This recording is not in the configured project Storage bucket.')
  }
  if (!file.path || /[\x00-\x1f]/.test(file.path)) throw new StorageReadError(400, 'Invalid recording path.')
  if (file.range && (!/^bytes=\d*-\d*$/.test(file.range) || file.range === 'bytes=-')) {
    throw new StorageReadError(416, 'Invalid recording byte range.')
  }
  let token: string | null | undefined
  try {
    const env = await firebaseEnvironment(root)
    if (!env.GOOGLE_APPLICATION_CREDENTIALS) throw new Error('No project credentials')
    const credentials = JSON.parse(await readFile(resolve(root, env.GOOGLE_APPLICATION_CREDENTIALS), 'utf8'))
    if (credentials.type !== 'service_account' || credentials.project_id !== config.projectId) {
      throw new Error('Wrong project credentials')
    }
    token = await new GoogleAuth({ credentials,
      scopes: ['https://www.googleapis.com/auth/devstorage.read_only'] }).getAccessToken()
    if (!token) throw new Error('No access token')
  } catch {
    throw new StorageReadError(503, 'Configure this project’s service-account key with '
      + 'npm run ops -- firebase-auth configure --key <file> before playing recordings.')
  }
  const url = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(file.bucket)}`
    + `/o/${encodeURIComponent(file.path)}?alt=media`
  const headers = new Headers({ Authorization: `Bearer ${token}` })
  if (file.range) headers.set('Range', file.range)
  const upstream = await fetch(url, { headers, redirect: 'error', signal: AbortSignal.timeout(60_000) })
  if (!upstream.ok && upstream.status !== 416) {
    await upstream.body?.cancel()
    if (upstream.status === 403 || upstream.status === 401) {
      throw new StorageReadError(403, 'The project service account needs Storage Object Viewer '
        + '(roles/storage.objectViewer) on this bucket to play recordings.')
    }
    throw new StorageReadError(upstream.status === 404 ? 404 : 502,
      upstream.status === 404 ? 'The recording was not found in Storage.'
        : 'Could not load the recording from Storage.')
  }
  const responseHeaders = new Headers({
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  const contentType = upstream.headers.get('Content-Type') ?? ''
  const audio = contentType.startsWith('audio/')
  responseHeaders.set('Content-Type', audio ? contentType : 'application/octet-stream')
  responseHeaders.set('Content-Disposition', audio ? 'inline' : 'attachment')
  for (const name of ['Content-Length', 'Content-Range', 'Accept-Ranges']) {
    const value = upstream.headers.get(name)
    if (value) responseHeaders.set(name, value)
  }
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders })
}
