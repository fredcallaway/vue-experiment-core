import { assertLocalStorageRequest, readStorageAudio, StorageReadError } from '../../operations/storage-reader'

export default defineEventHandler(async event => {
  try {
    const url = getRequestURL(event)
    assertLocalStorageRequest({ hostname: url.hostname, origin: url.origin,
      remoteAddress: event.node.req.socket.remoteAddress, requestOrigin: getHeader(event, 'origin'),
      fetchSite: getHeader(event, 'sec-fetch-site') })
    const { bucket, path } = getQuery(event)
    if (typeof bucket !== 'string' || typeof path !== 'string') {
      throw new StorageReadError(400, 'Provide the recording bucket and path.')
    }
    return await sendWebResponse(event, await readStorageAudio(process.cwd(), {
      bucket, path, range: getHeader(event, 'range'),
    }))
  } catch (cause) {
    throw createError({ statusCode: cause instanceof StorageReadError ? cause.statusCode : 502,
      message: cause instanceof StorageReadError ? cause.message : 'Could not load the recording. Please try again.' })
  }
})
