import { writeFile } from 'fs/promises'
import { join } from 'path'

const CONFIG_FILE = join(process.cwd(), 'prolific.config.ts')

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  
  if (typeof body !== 'object' || body === null) {
    throw createError({
      statusCode: 400,
      message: 'Body must be an object'
    })
  }

  const configString = `export default defineProlificConfig(${JSON.stringify(body, null, 2)})\n`
  
  await writeFile(CONFIG_FILE, configString, 'utf-8')
  
  return { success: true }
})
