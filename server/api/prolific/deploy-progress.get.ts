import { hostingVerification } from '../../utils/hostingVerification'

export default defineEventHandler(() => ({ verifying: hostingVerification.pending }))
