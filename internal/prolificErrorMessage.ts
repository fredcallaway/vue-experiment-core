// Only structured, interactive validation failures are safe to present as expected errors.
export const getProlificErrorMessage = (status: number, response: any): string | null => {
  const error = response?.data?.error ?? response?.error
  if (status !== 400 || error?.interactive !== true) return null

  const details = typeof error.detail === 'string' ? [error.detail] : error.detail
  if (!Array.isArray(details) || !details.length) return null
  if (!details.every(detail => typeof detail === 'string' && detail.trim())) return null
  return details.map(detail => detail.trim()).join('\n')
}
