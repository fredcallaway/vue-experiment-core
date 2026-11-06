import { clone, isDeepEqual } from 'remeda'
import type { CsvDataView, JsonDataView } from '../composables/dataViews'
import type { SessionData } from './data'

type Views = Record<string, CsvDataView | JsonDataView>
export type PreviewResult = { ok: true; data: unknown } | { ok: false; error: string }

// Output contents establish activity, rather than transform execution or row count.
export class DataViewPreview {
  private snapshots = new Map<string, unknown>()
  private changedAt = new Map<string, number>()
  private revision = 0

  update(views: Views, session: SessionData, trackChanges = true): Record<string, PreviewResult> {
    this.revision++
    for (const name of this.snapshots.keys()) {
      if (!(name in views)) {
        this.snapshots.delete(name)
        this.changedAt.delete(name)
      }
    }
    const results: Record<string, PreviewResult> = {}
    for (const [name, view] of Object.entries(views)) {
      try {
        const data = view.fn(session)
        const changed = !this.snapshots.has(name) || !isDeepEqual(this.snapshots.get(name), data)
        if (changed) {
          // Transforms may return objects shared with events, metadata, or their previous output.
          this.snapshots.set(name, clone(data))
          if (trackChanges) this.changedAt.set(name, this.revision)
        }
        results[name] = { ok: true, data: this.snapshots.get(name) }
      } catch (error) {
        results[name] = { ok: false, error: String((error as Error)?.message ?? error) }
      }
    }
    return results
  }

  select(names: string[], epochNames: string[], previous?: string): string | undefined {
    // The caller supplies logical names from the current epoch towards the root.
    for (const epoch of epochNames) {
      const matches = names.filter(name => name.toLowerCase() === epoch.toLowerCase())
      if (matches.length === 1) return matches[0]
      if (matches.length > 1) break
    }
    const latest = Math.max(0, ...names.map(name => this.changedAt.get(name) ?? 0))
    const candidates = names.filter(name => (this.changedAt.get(name) ?? 0) === latest)
    return previous && candidates.includes(previous) ? previous : candidates[0]
  }
}
