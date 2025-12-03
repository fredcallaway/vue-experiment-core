import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'fs'
import { join, resolve, relative } from 'path'

const DATA_DIR = resolve(process.cwd(), 'data')

function getFilePath(pathParam: string | string[]): string {
  const pathSegments = Array.isArray(pathParam) ? pathParam : [pathParam]
  const relativePath = pathSegments.map(decodeURIComponent).join('/')
  const fullPath = resolve(DATA_DIR, relativePath)
  
  // Security check: ensure path is within data directory
  const relativeToData = relative(DATA_DIR, fullPath)
  if (relativeToData.startsWith('..') || relativeToData.startsWith('/')) {
    throw createError({
      statusCode: 400,
      message: 'Path must be within data directory'
    })
  }
  
  return fullPath
}

function objectsToCsv(rows: object[]): string {
  if (rows.length === 0) return ''
  
  const headers = Object.keys(rows[0])
  const headerLine = headers.join(',')
  
  const dataLines = rows.map(row => {
    return headers.map(header => {
      const value = (row as any)[header]
      if (value === null || value === undefined) return ''
      const str = typeof value === 'object' ? JSON.stringify(value) : String(value)
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`
      }
      return str
    }).join(',')
  })
  
  return [headerLine, ...dataLines].join('\n')
}

function csvToObjects(csv: string): object[] {
  if (!csv.trim()) return []
  
  const lines = csv.split('\n').filter(line => line.trim())
  if (lines.length === 0) return []
  
  const headers = parseCsvLine(lines[0])
  const rows = lines.slice(1).map(line => {
    const values = parseCsvLine(line)
    const row: Record<string, any> = {}
    headers.forEach((header, i) => {
      const value = values[i] || ''
      if (value) {
        try {
          const parsed = JSON.parse(value)
          row[header] = typeof parsed === 'object' ? parsed : value
        } catch {
          row[header] = value
        }
      } else {
        row[header] = value
      }
    })
    return row
  })
  
  return rows
}

function parseCsvLine(line: string): string[] {
  const values: string[] = []
  let current = ''
  let inQuotes = false
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current)
      current = ''
    } else {
      current += char
    }
  }
  
  values.push(current)
  return values
}


const readFile = (filePath: string) => {
  try {
    const content = readFileSync(filePath, 'utf-8')
    if (filePath.endsWith('.json')) {
      return JSON.parse(content)
    } else if (filePath.endsWith('.csv')) {
      return csvToObjects(content)
    }
    return content
  } catch (error: any) {
    throw createError({
      statusCode: 500,
      message: `Failed to read file: ${error.message}`
    })
  }
}

const writeFile = (filePath: string, content: any) => {
  // ensure content is string
  if (typeof content !== 'string') {
    if (filePath.endsWith('.csv')) {
      if (!Array.isArray(content)) {
        throw createError({
          statusCode: 400,
          message: 'CSV file content must be an array of objects'
        })
      }
      content = objectsToCsv(content)
    } else if (filePath.endsWith('.json')) {
      content = JSON.stringify(content)
    } else {
      throw createError({
        statusCode: 400,
        message: 'File path must end with .json or .csv if content is not string'
      })
    }
  }
  try {
    // Create directory if it doesn't exist
    const dirPath = join(filePath, '..')
    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true })
    }
    writeFileSync(filePath, content, 'utf-8')
  } catch (error: any) {
    throw createError({
      statusCode: 500,
      message: `Failed to write file: ${error.message}`
    })
  }
}

export default defineEventHandler(async (event) => {
  console.log(event.method, 'data/', event.context.params?.path)
  const pathParam = event.context.params?.path
  if (!pathParam) {
    throw createError({
      statusCode: 400,
      message: 'Path is required'
    })
  }

  const filePath = getFilePath(pathParam)
  const method = event.method

  if (method === 'GET') {
    if (!existsSync(filePath)) {
      const defaultValue = getQuery(event).default
      if (defaultValue === undefined) {
        throw createError({
          statusCode: 404,
          message: 'File not found'
        })
      }
      writeFile(filePath, defaultValue)
      // Parse JSON default values that were serialized as query params
      if (filePath.endsWith('.json') && typeof defaultValue === 'string') {
        return JSON.parse(defaultValue)
      }
      return defaultValue
    }
    return readFile(filePath)
  }

  else if (method === 'POST' || method === 'PUT') {
    const body = await readBody(event)
    
    if (body === undefined || body === null) {
      throw createError({
        statusCode: 400,
        message: 'Request body is required'
      })
    }
    writeFile(filePath, body)
    return
  } 
  
  else {
    throw createError({
      statusCode: 405,
      message: `Method ${method} not allowed`
    })
  }
})

