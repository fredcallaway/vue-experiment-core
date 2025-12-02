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
    const response = await $fetch(url, {
      method,
      headers: {
        'Authorization': `Token ${token}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    
    return response
  } catch (error: any) {
    throw createError({
      statusCode: error.response?.status || 500,
      message: error.message || 'Prolific API request failed',
      data: error.data
    })
  }
})

