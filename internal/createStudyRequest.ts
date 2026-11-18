/** Retry a rejected creation only when Prolific identifies nonexistent blocklisted users. */
export async function createStudyRequest<T>(body: any, post: (body: any) => Promise<T>): Promise<T> {
  try {
    return await post(body)
  } catch (error: any) {
    const validation = error.data?.error
    if (error.response?.status !== 400 || validation?.error_code !== 140003 || !validation.detail) throw error

    const removals = new Map<number, Set<string>>()
    for (const [index, detail] of Object.entries(validation.detail) as [string, any][]) {
      if (!/^\d+$/.test(index)) throw error
      const filter = body.filters?.[Number(index)]
      if (!filter || !/blocklist|blacklist/i.test(filter.filter_id) ||
        !Array.isArray(detail.invalid_user_ids) || !detail.invalid_user_ids.length ||
        (detail.invalid_ids?.length ?? 0) > 0 ||
        Object.keys(detail).some(key => !['invalid_ids', 'invalid_user_ids'].includes(key)) ||
        detail.invalid_user_ids.some((id: unknown) => typeof id !== 'string' || !filter.selected_values?.includes(id))) {
        throw error
      }
      removals.set(Number(index), new Set(detail.invalid_user_ids))
    }
    if (!removals.size) throw error

    const filters = body.filters.flatMap((filter: any, index: number) => {
      const rejected = removals.get(index)
      if (!rejected) return [filter]
      const selected_values = filter.selected_values.filter((id: string) => !rejected.has(id))
      return selected_values.length ? [{ ...filter, selected_values }] : []
    })
    // A 400 validation rejection did not create a study. Retry once, preserving every valid exclusion.
    return post({ ...body, filters })
  }
}
