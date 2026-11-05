import { initializeApp } from 'firebase/app'
import { getAuth, signInAnonymously, type User } from 'firebase/auth'
import { getStorage, ref, uploadBytes } from 'firebase/storage'
import firebaseConfig from '~/firebase.config.json'
import { isJumping } from '../internal/state'
import { useCurrentSession } from './useCurrentSession'
import { useDataWriter } from './useDataWriter'

export type StoredFile = {
  saved: true
  path: string
  bucket: string
  size: number
  contentType: string
}
export type FileUploadResult = StoredFile | { saved: false; path: null }

// Matches the supplied Storage rules. Use smaller application-specific limits when needed.
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024
let signingIn: Promise<User> | undefined

export function useFirebaseStorage() {
  const session = useCurrentSession()
  const writer = useDataWriter()

  async function upload(filename: string, blob: Blob): Promise<FileUploadResult> {
    if (!filename || filename === '.' || filename === '..' || /[\x00-\x1f/\\]/.test(filename)) {
      throw new Error('Provide a filename without directories or control characters.')
    }
    if (!blob.size || blob.size > MAX_UPLOAD_BYTES) {
      throw new Error(`File size must be between 1 and ${MAX_UPLOAD_BYTES} bytes.`)
    }
    if (session.mode !== 'live' || isJumping.value) return { saved: false, path: null }
    const assertWritable = () => {
      if (!writer.writable || writer.sessionId !== session.sessionId) {
        throw new Error('File uploads require an active, initialized experiment session.')
      }
    }
    assertWritable()
    if (!('storageBucket' in firebaseConfig) || !firebaseConfig.storageBucket) {
      throw new Error('Set storageBucket in firebase.config.json and follow the audio and files setup guide.')
    }
    const app = initializeApp(firebaseConfig)
    const auth = getAuth(app)
    await auth.authStateReady()
    if (!auth.currentUser) {
      signingIn ??= signInAnonymously(auth).then(result => result.user).finally(() => { signingIn = undefined })
      await signingIn
    }
    assertWritable()
    if (!auth.currentUser) throw new Error('Firebase authentication ended before the upload started.')
    const segment = encodeURIComponent
    const path = `sessions/${segment(auth.currentUser.uid)}/${segment(session.sessionId)}/${segment(filename)}`
    const result = await uploadBytes(ref(getStorage(app), path), blob, {
      contentType: blob.type.split(';')[0] || 'application/octet-stream',
      customMetadata: {
        sessionId: session.sessionId, participantId: session.participantId,
        studyId: session.studyId, version: session.version,
      },
    })
    assertWritable()
    const file: StoredFile = { saved: true, path: result.metadata.fullPath, bucket: result.metadata.bucket,
      size: result.metadata.size, contentType: result.metadata.contentType ?? 'application/octet-stream' }
    const key = encodeURIComponent(filename).replaceAll('.', '%2E')
    writer.updateOther(`files/${key}`, file)
    return file
  }

  return { upload }
}
