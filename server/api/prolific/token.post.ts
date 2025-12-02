import { writeFile } from 'fs/promises'
import { join } from 'path'

const TOKEN_FILE = join(process.cwd(), '.prolific_token')

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { token } = body

  if (typeof token !== 'string') {
    throw createError({
      statusCode: 400,
      message: 'Token must be a string'
    })
  }

  try {
    await writeFile(TOKEN_FILE, token.trim(), 'utf-8')
    return { success: true }
  } catch (error: any) {
    throw createError({
      statusCode: 500,
      message: `Failed to write token file: ${error.message}`
    })
  }
})

