import { createStudyRequest } from '../../../internal/createStudyRequest'

export default defineEventHandler(async (event) => {
  const slug = event.context.params?.slug || ''
  const path = Array.isArray(slug) ? slug.join('/') : slug
  const method = event.method
  const query = getQuery(event)
  
  // Get token from header
  const token = getHeader(event, 'x-prolific-token')
  if (!token) {
    throw createError({
      statusCode: 401,
      message: 'No Prolific token provided'
    })
  }

  // Build URL
  const baseUrl = 'https://api.prolific.com/api/v1'
  let url = `${baseUrl}/${path}`
  
  // Add trailing slash if needed (Prolific API requirement)
  if (!url.endsWith('/') && !url.includes('?')) {
    url += '/'
  }
  
  // Add query params
  const queryString = new URLSearchParams(query as Record<string, string>).toString()
  if (queryString) {
    url += (url.includes('?') ? '&' : '?') + queryString
  }

  // Get body for POST/PATCH requests
  let body
  if (method === 'POST' || method === 'PATCH') {
    body = await readBody(event)
  }

  // Make request to Prolific API
  try {
    const send = (payload: any) => $fetch.raw(url, {
      method,
      headers: {
        'Authorization': `Token ${token}`,
        'Content-Type': 'application/json',
      },
      body: payload ? JSON.stringify(payload) : undefined,
    })
    
    const endpoint = path.replace(/\/+$/, '')
    const response = method === 'POST' && endpoint === 'studies'
      ? await createStudyRequest(body, send) : await send(body)
    const isReviewAcknowledgment = method === 'POST' && (
      endpoint === 'submissions/bulk-approve' || /^bulk-bonus-payments\/[^/]+\/pay$/.test(endpoint)
    )
    const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()
    const data = response._data
    if (isReviewAcknowledgment && typeof data === 'string'
      && (contentType === 'application/json' || contentType === 'text/plain') && !/^\s*</.test(data)) {
      // H3 serves bare strings as HTML. Keep these acknowledgments in the dashboard's JSON format.
      setResponseStatus(event, response.status)
      return { message: data }
    }
    return data
  } catch (error: any) {
    throw createError({
      statusCode: error.response?.status || 500,
      message: error.message || 'Prolific API request failed',
      data: error.data
    })
  }
})

