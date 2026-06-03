<script lang="ts" setup>
import stringify from "json-stringify-pretty-compact";

// Live preview of a declared data view. Accumulates events off the log bus as the
// session runs and re-runs the selected view's `fn`, so a developer building a task
// sees its export rows materialize as they play through it.
//
// Data views are registered globally by name (see composables/dataViews.ts) with no
// built-in link to the SFC that declared them. By convention, a view's name matches
// the epoch's logical name (e.g. `clicktest`), so we auto-select the view whose name
// appears in the current epoch path. A manual selector covers cases where it doesn't.

const views = useDataViews()
const viewNames = computed(() => Object.keys(views))

const currentEpoch = useCurrentEpoch()
const epochPath = computed(() => {
  const segments: string[] = []
  let node = currentEpoch.value
  while (node._name !== '__TOP_EPOCH__') {
    segments.push(node._name, node.id)
    node = node._parent
  }
  return segments.map(s => s.toLowerCase())
})

const autoSelected = computed(() =>
  viewNames.value.find(name => epochPath.value.some(seg => seg.includes(name.toLowerCase())))
)

// '' / missing => follow autoSelected; otherwise honor the explicit pick if still present.
const override = useLocalStorage('dataView.selected', '')
const selectedName = computed(() => {
  if (override.value && viewNames.value.includes(override.value)) return override.value
  return autoSelected.value ?? viewNames.value[0]
})
const view = computed(() => selectedName.value ? views[selectedName.value] : undefined)

// Accumulate the live event stream for this session.
const events = reactive<LogEvent[]>([])
useLogEventBus().on(e => events.push(e))

const result = computed(() => {
  const v = view.value
  if (!v) return null
  try {
    return { ok: true as const, data: v.fn({ meta: {} as any, events: [...events] }) }
  } catch (error) {
    return { ok: false as const, error: String((error as Error)?.message ?? error) }
  }
})

const rows = computed(() => {
  const r = result.value
  if (!r?.ok || view.value?.format !== 'csv') return []
  return r.data as Record<string, any>[]
})
const columns = computed(() => {
  const keys = new Set<string>()
  for (const row of rows.value) Object.keys(row).forEach(k => keys.add(k))
  return [...keys]
})

const jsonText = computed(() => {
  const r = result.value
  if (!r?.ok || view.value?.format !== 'json') return ''
  return stringify(r.data, { indent: 2, maxLength: 60 })
})

const fmtCell = (value: unknown) => (value === null || value === undefined ? '—' : String(value))
</script>

<template>
  <div
    v-if="viewNames.length > 0"
    border="~ 2 gray-300"
    p-2
    text-sm
    rounded-lg
    min-w="300px"
    flex="~ col"
    relative
    h="500px"
  >
    <div flex="~ row items-center gap-2" mb-2>
      <h2 shrink-0>Data</h2>
      <select
        v-model="override"
        bg-white
        border="~ gray-300"
        rounded
        px-1
        text-xs
        ml-auto
      >
        <option value="">auto{{ autoSelected ? ` (${autoSelected})` : '' }}</option>
        <option v-for="name in viewNames" :key="name" :value="name">{{ name }}</option>
      </select>
    </div>

    <div v-if="result && !result.ok" text-xs text-red-600 font-mono whitespace-pre-wrap flex-1 min-h-0 overflow-y-auto>
      {{ result.error }}
    </div>

    <template v-else-if="view?.format === 'json'">
      <pre text-xs class="subtle-scrollbar whitespace-pre-wrap break-words flex-1 min-h-0 overflow-y-auto">{{ jsonText }}</pre>
    </template>

    <template v-else-if="rows.length">
      <div class="subtle-scrollbar flex-1 min-h-0 overflow-y-auto">
        <table text-xs b-1 b-gray-200 rounded w-full>
          <thead bg-gray-50>
            <tr>
              <th v-for="col in columns" :key="col" p1 text-left>{{ col }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, i) in rows" :key="i" b-t b-gray-100>
              <td v-for="col in columns" :key="col" p1>{{ fmtCell(row[col]) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <div v-else text-sm text-gray-400 italic>No rows yet.</div>
  </div>
</template>
