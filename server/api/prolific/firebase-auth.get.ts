import { firebaseCredentialStatus } from '../../../operations/firebase-auth'

export default defineEventHandler(async event => {
  setHeader(event, 'Cache-Control', 'no-store')
  return firebaseCredentialStatus(process.cwd())
})
