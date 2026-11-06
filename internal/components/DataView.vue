<script lang="ts" setup>
import { useDataViews } from '../../composables/dataViews'
import { useLogEventBus } from '../../composables/logEvent'
import { useCurrentSession } from '../../composables/useCurrentSession'
import { useCurrentEpoch } from '../../composables/useEpoch'
import { type LogEvent } from '../data'
import { DataViewPreview, type PreviewResult } from '../dataViewPreview'
import { useLocalStorage } from '@vueuse/core'

import stringify from "json-stringify-pretty-compact";

// Live preview of a declared data view. Accumulates events off the log bus as the
// session runs and re-runs the declared transforms, so a developer building a task
// sees its export rows materialize as they play through it.
//
// Data views are registered globally by name (see composables/dataViews.ts) with no
// built-in link to the SFC that declared them. Auto prefers the deepest whole-name
// epoch match, then follows changed output. Manual picks remain authoritative.

const views = useDataViews()
const viewNames = computed(() => Object.keys(views))
const meta = useCurrentSession()

const currentEpoch = useCurrentEpoch()
const epochNames = computed(() => {
  const segments: string[] = []
  let node = currentEpoch.value
  while (node._name !== '__TOP_EPOCH__') {
    segments.push(node._name)
    node = node._parent
  }
  return segments
})

const preview = new DataViewPreview()
const results = shallowRef<Record<string, PreviewResult>>({})
const autoSelected = ref<string>()
const selectAuto = () => {
  autoSelected.value = preview.select(viewNames.value, epochNames.value, autoSelected.value)
}

// '' / missing => follow autoSelected; otherwise honor the explicit pick if still present.
const override = useLocalStorage('dataView.selected', '')
const selectedName = computed(() => {
  if (override.value && viewNames.value.includes(override.value)) return override.value
  return autoSelected.value ?? viewNames.value[0]
})
const view = computed(() => selectedName.value ? views[selectedName.value] : undefined)

// Accumulate the live event stream for this session.
const events: LogEvent[] = []
const refresh = (trackChanges = true) => {
  results.value = preview.update(views, { meta, events: [...events] }, trackChanges)
  selectAuto()
}
useLogEventBus().on(event => {
  events.push(event)
  refresh()
})
watch(views, () => refresh(false), { immediate: true, deep: true })
watch(meta, () => refresh(), { deep: true })
watch(epochNames, selectAuto)
const result = computed(() => selectedName.value ? results.value[selectedName.value] : undefined)

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
    class="border border-2 border-gray-300 p-2 text-sm rounded-lg min-w-300px flex flex-col relative h-500px"
    v-if="viewNames.length > 0"
  >
    <div class="flex flex-row flex-items-center flex-gap-2 mb-2">
      <h2 class="shrink-0">Data</h2>
      <TutorialTarget
        class="ml-auto"
        title="Data view selector"
        help="Auto prefers the deepest matching epoch name, then the most recently changed output. Choose a view to pin it."
        placement="left"
      >
        <select aria-label="Data view" class="bg-white border border-gray-300 rounded px-1 text-xs" v-model="override">
          <option value="">auto{{ autoSelected ? ` (${autoSelected})` : '' }}</option>
          <option v-for="name in viewNames" :key="name" :value="name">{{ name }}</option>
        </select>
      </TutorialTarget>
    </div>

    <TutorialTarget
      class="text-xs text-red-600 font-mono whitespace-pre-wrap flex-1 min-h-0 overflow-y-auto"
      v-if="result && !result.ok"
      title="Data view error"
      help="Shows errors thrown while running the selected data view against the live event stream."
    >
      {{ result.error }}
    </TutorialTarget>

    <TutorialTarget
      v-else-if="view?.format === 'json'"
      class="flex flex-col flex-1 min-h-0"
      title="JSON preview"
      help="Shows the selected JSON data view output for events recorded during this debug session."
    >
      <pre
        class="[scrollbar-gutter:stable] [scrollbar-width:thin] [scrollbar-color:rgba(0,0,0,0.2)_transparent] whitespace-pre-wrap break-words flex-1 min-h-0 overflow-y-auto text-xs"
      >{{ jsonText }}</pre>
    </TutorialTarget>

    <TutorialTarget
      v-else-if="rows.length"
      class="flex flex-col flex-1 min-h-0"
      title="CSV preview"
      help="Shows CSV rows produced by the selected data view from the live debug-session events."
    >
      <div
        class="[scrollbar-gutter:stable] [scrollbar-width:thin] [scrollbar-color:rgba(0,0,0,0.2)_transparent] flex-1 min-h-0 overflow-y-auto"
      >
        <table class="text-xs b-1 b-gray-200 rounded w-full">
          <thead class="bg-gray-50">
            <tr>
              <th class="p1 text-left" v-for="col in columns" :key="col">{{ col }}</th>
            </tr>
          </thead>
          <tbody>
            <tr class="b-t b-gray-100" v-for="(row, i) in rows" :key="i">
              <td class="p1" v-for="col in columns" :key="col">
                <DataViewCell :value="fmtCell(row[col])" :column="col" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </TutorialTarget>

    <TutorialTarget
      class="text-sm text-gray-400 italic"
      v-else
      title="Empty data preview"
      help="The selected data view has no output yet. Run through epochs that log its source events."
    >No rows yet.</TutorialTarget>
  </div>
</template>
