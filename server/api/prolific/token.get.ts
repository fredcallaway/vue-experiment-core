import { readFile } from 'fs/promises'
import { join } from 'path'

const TOKEN_FILE = join(process.cwd(), '.prolific_token')

export default defineEventHandler(async (event) => {
  try {
    const token = await readFile(TOKEN_FILE, 'utf-8')
    return { token: token.trim() }
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return { token: '' }
    }
    throw createError({
      statusCode: 500,
      message: `Failed to read token file: ${error.message}`
    })
  }
})

