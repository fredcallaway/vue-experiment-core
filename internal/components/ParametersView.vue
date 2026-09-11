<script lang="ts" setup>
// Dev panel: typed controls for the URL query params the experiment reads, plus a yoked
// "url params" field at the top that always shows exactly what the controls resolve to
// (edit it and the controls re-hydrate; unrecognized params are preserved on apply).
//
// Apps register their experiment-specific params by adding ParamSpec entries to
// `registriesByPath`, keyed by route.path. Controls render by kind: 'buttons' for small value
// sets (order on | off, on to the left), 'select' for larger enumerable ones, 'text' for
// open-ended values. group: 'design' renders inside the "design condition" section (the key
// experimental design conditions); everything else lands in the collapsed "other params".
//
// The resolved `experiment.condition` payload (captured via useLatestCondition) renders at the
// bottom: scalars inline, nested structures through <CondValue> — a recursive gwern-style
// inspector whose popups can nest.
type ParamOption = { value: string, label: string }
type ParamSpec = {
  key: string
  label: string
  kind: 'buttons' | 'select' | 'text'
  options?: ParamOption[]
  hint?: string
  placeholder?: string
  /** 'design' = key experimental design conditions; 'session' = everything else. */
  group?: 'design' | 'session'
}

const meta = useCurrentSession()
const condition = useLatestCondition()
const route = useRoute()

const rangeOptions = (count: number): ParamOption[] =>
  Array.from({ length: count }, (_, i) => ({ value: String(i), label: String(i) }))
void rangeOptions // exported pattern for app registries (e.g. condition indexes)

const SHARED_MODE: ParamSpec = {
  key: 'mode',
  label: 'mode',
  kind: 'select',
  group: 'session',
  options: [
    { value: '', label: '(auto)' },
    { value: 'debug', label: 'debug' },
    { value: 'live', label: 'live' },
  ],
  hint: 'data mode; auto = inferred from session params',
}
const SHARED_SESSION: ParamSpec[] = [
  { key: 'session_id', label: 'session_id', kind: 'text', placeholder: 'blank = auto', group: 'session' },
  // Emits the uppercase PROLIFIC_PID param — that's what Prolific sends and what the app reads
  // (useCurrentSession: participant_id || PROLIFIC_PID); labeled participant_id for display.
  { key: 'PROLIFIC_PID', label: 'participant_id', kind: 'text', group: 'session' },
  { key: 'study_id', label: 'study_id', kind: 'text', group: 'session' },
]

// Apps: add per-page entries here (or in a copy of this file) for the experiment's own params —
// e.g. condition selects built with rangeOptions(N), design-factor buttons, etc.
const registriesByPath: Record<string, ParamSpec[]> = {}

const DEFAULT_REGISTRY: ParamSpec[] = [SHARED_MODE, ...SHARED_SESSION]

const registry = computed<ParamSpec[]>(() => registriesByPath[route.path] ?? DEFAULT_REGISTRY)
const registryKeys = computed(() => new Set(registry.value.map(p => p.key)))
const designParams = computed(() => registry.value.filter(p => p.group === 'design'))
const mainParams = computed(() => registry.value.filter(p => p.group == null))
const sessionParams = computed(() => registry.value.filter(p => p.group === 'session'))

// Current URL query as a flat string map (first value wins for repeated keys).
const currentQuery = () => {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(route.query)) {
    out[k] = Array.isArray(v) ? String(v[0] ?? '') : String(v ?? '')
  }
  return out
}

// Editable model for the registered params. Missing param → '' (its "default/unset" option).
const values = ref<Record<string, string>>({})
// Registry params are always covered by controls; everything else is preserved verbatim.
const otherParams = ref('')

// The query string apply() would produce from the current control state. Also drives the dirty
// check, so equivalent edits (whitespace, reverting a control) don't count as changes.
const buildParams = () => {
  const params = new URLSearchParams()
  // Preserve unknown params first so registered controls take precedence on collisions.
  for (const [k, v] of new URLSearchParams(otherParams.value.trim().replace(/^\?/, ''))) {
    params.set(k, v)
  }
  for (const spec of registry.value) {
    const v = (values.value[spec.key] ?? '').trim()
    if (v === '') params.delete(spec.key)
    else params.set(spec.key, v)
  }
  return params
}

// Canonical serialization of the controls as hydrated from the URL; the pane is dirty when the
// would-be query string differs from it.
const appliedQuery = ref('')

// Populate the controls from a flat query map (from the URL at load, or from an edit to the yoked
// "url params" field). Values the controls can't represent stay in otherParams, never dropped.
const hydrateFrom = (q: Record<string, string>) => {
  const next: Record<string, string> = {}
  for (const spec of registry.value) next[spec.key] = q[spec.key] ?? ''
  values.value = next

  const rest = new URLSearchParams()
  for (const [k, v] of Object.entries(q)) {
    if (!registryKeys.value.has(k)) rest.set(k, v)
  }
  otherParams.value = rest.toString()
}

const hydrate = () => {
  hydrateFrom(currentQuery())
  // Prefill from the RESOLVED session so the controls show reality instead of duplicating it in a
  // separate read-only row. Done before the dirty snapshot, so the prefill itself isn't a change
  // (though applying any change will then pin these values in the URL).
  if ((values.value['session_id'] ?? '') === '' && meta.sessionId) values.value['session_id'] = String(meta.sessionId)
  if ((values.value['mode'] ?? '') === '' && meta.mode) values.value['mode'] = String(meta.mode)
  appliedQuery.value = buildParams().toString()
}
hydrate()

const dirty = computed(() => buildParams().toString() !== appliedQuery.value)

const apply = () => {
  if (!dirty.value) return // Cmd/Ctrl+Enter can still fire while the button is disabled
  window.location.search = buildParams().toString()
}

// Yoked "url params" field: always displays the full query string the controls will emit; editing
// it re-hydrates the controls (two-way). The watcher only fires on control changes, so it doesn't
// clobber in-progress typing; the edit lands on change (blur/enter).
const urlParamsText = ref('')
watchEffect(() => { urlParamsText.value = buildParams().toString() })
const onUrlParamsEdit = () => {
  const q: Record<string, string> = {}
  for (const [k, v] of new URLSearchParams(urlParamsText.value.trim().replace(/^\?/, ''))) q[k] = v
  hydrateFrom(q)
}

// Open the details automatically when something inside them is set in the URL.
const sessionOpen = ref(
  sessionParams.value.some(spec => (currentQuery()[spec.key] ?? '') !== '')
  || otherParams.value !== '',
)
const designOpen = ref(
  designParams.value.some(spec => (currentQuery()[spec.key] ?? '') !== ''),
)

// sessionId and mode aren't listed here — the session_id input and mode dropdown are prefilled
// with the resolved values instead. assignment/version are read-only facts (assignment is derived
// from ?assignment/?condition; version comes from the build).
const metaRows = computed(() => [
  ['assignment', meta.assignment],
  ['version', meta.version],
] as [string, unknown][])

const isScalar = (v: unknown) => v == null || ['string', 'number', 'boolean'].includes(typeof v)
// Scalars render inline; nested structures render via <CondValue> (recursive popup inspector).
const conditionRows = computed(() => {
  const data = condition.value
  if (!data) return []
  const entries = Object.entries(data)
  const scalars = entries.filter(([, v]) => isScalar(v))
  const nested = entries.filter(([, v]) => !isScalar(v))
  return [...scalars, ...nested].map(([key, v]) => ({ key, raw: v, scalar: isScalar(v) }))
})
</script>

<template>
  <!-- No top padding on the scroller: a sticky child cannot escape the content box, so any panel
       padding-top would stay a see-through strip above the stuck header. The header carries the
       top/side padding itself (opaque, full-bleed via negative x-margins). -->
  <div border="~ 2 gray-300" bg-white rounded-lg px-2 pb-2 text-sm flex="~ col gap-1.5" overflow-y-auto class="subtle-scrollbar">
    <div flex="~ items-center justify-between" sticky top-0 bg-white z-10 style="margin: 0 -0.5rem; padding: 0.5rem 0.5rem 0.25rem;">
      <h2 m-0 text-base>Parameters</h2>
      <button btn-primary btn-xs :disabled="!dirty" @click="apply">Apply &amp; reload</button>
    </div>

    <!-- typed controls for the critical URL params (registry keyed by page); one row per param.
         Hints are title tooltips (hover the label) to keep the pane scroll-free. -->
    <div v-if="registry.length" flex="~ col gap-1" @keydown.meta.enter="apply" @keydown.ctrl.enter="apply">
      <!-- yoked url-params field up top: always shows what the controls below resolve to -->
      <div flex="~ items-center gap-2" title="the full query string the controls will emit — yoked: edit it (blur/enter) and the controls update; unrecognized params are preserved">
        <label text-xs text-gray-600 font-medium w="115px" shrink-0 truncate>url params</label>
        <input
          v-model="urlParamsText"
          type="text"
          spellcheck="false"
          placeholder="key=value&key2=value2"
          class="input font-mono !text-xs !px-2 !py-0.5 flex-1 min-w-0"
          @change="onUrlParamsEdit"
        >
      </div>

      <!-- design box: the key experimental design conditions -->
      <details v-if="designParams.length" :open="designOpen">
        <summary text-gray-500 text-xs cursor-pointer select-none>design condition</summary>
        <div border="~ gray-200" rounded-md p-1.5 flex="~ col gap-1" bg-gray-50 mt-1>
          <div v-for="spec in designParams" :key="spec.key" flex="~ items-center gap-2" :title="spec.hint">
            <label text-xs text-gray-600 font-medium w="115px" shrink-0 truncate>{{ spec.label }}</label>
            <div v-if="spec.kind === 'buttons'" flex="~ gap-1 wrap" flex-1 min-w-0>
              <button
                v-for="opt in spec.options"
                :key="opt.value"
                btn-xs
                :class="values[spec.key] === opt.value ? 'btn-primary' : 'btn-gray'"
                @click="values[spec.key] = opt.value"
              >{{ opt.label }}</button>
            </div>
            <select
              v-else-if="spec.kind === 'select'"
              v-model="values[spec.key]"
              class="input !text-xs !px-2 !py-0.5 flex-1 min-w-0"
            >
              <option v-for="opt in spec.options" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
            <input
              v-else
              v-model="values[spec.key]"
              type="text"
              spellcheck="false"
              :placeholder="spec.placeholder"
              class="input font-mono !text-xs !px-2 !py-0.5 flex-1 min-w-0"
            >
          </div>
        </div>
      </details>

      <!-- ungrouped params render inline -->
      <div v-for="spec in mainParams" :key="spec.key" flex="~ items-center gap-2" :title="spec.hint">
        <label text-xs text-gray-600 font-medium w="115px" shrink-0 truncate>{{ spec.label }}</label>
        <div v-if="spec.kind === 'buttons'" flex="~ gap-1 wrap" flex-1 min-w-0>
          <button
            v-for="opt in spec.options"
            :key="opt.value"
            btn-xs
            :class="values[spec.key] === opt.value ? 'btn-primary' : 'btn-gray'"
            @click="values[spec.key] = opt.value"
          >{{ opt.label }}</button>
        </div>
        <select
          v-else-if="spec.kind === 'select'"
          v-model="values[spec.key]"
          class="input !text-xs !px-2 !py-0.5 flex-1 min-w-0"
        >
          <option v-for="opt in spec.options" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
        <input
          v-else
          v-model="values[spec.key]"
          type="text"
          spellcheck="false"
          :placeholder="spec.placeholder"
          class="input font-mono !text-xs !px-2 !py-0.5 flex-1 min-w-0"
        >
      </div>

      <!-- rarely-touched session ids, read-only session meta, + any URL params not in the
           registry (preserved on apply) -->
      <details :open="sessionOpen" border-t="~ gray-200" pt-1 mt-0.5>
        <summary text-gray-500 text-xs cursor-pointer select-none>other params</summary>
        <div flex="~ col gap-1" mt-1>
          <div v-for="spec in sessionParams" :key="spec.key" flex="~ items-center gap-2" :title="spec.hint">
            <label text-xs text-gray-600 font-medium w="115px" shrink-0 truncate>{{ spec.label }}</label>
            <div v-if="spec.kind === 'buttons'" flex="~ gap-1 wrap" flex-1 min-w-0>
              <button
                v-for="opt in spec.options"
                :key="opt.value"
                btn-xs
                :class="values[spec.key] === opt.value ? 'btn-primary' : 'btn-gray'"
                @click="values[spec.key] = opt.value"
              >{{ opt.label }}</button>
            </div>
            <select
              v-else-if="spec.kind === 'select'"
              v-model="values[spec.key]"
              class="input !text-xs !px-2 !py-0.5 flex-1 min-w-0"
            >
              <option v-for="opt in spec.options" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
            <input
              v-else
              v-model="values[spec.key]"
              type="text"
              spellcheck="false"
              :placeholder="spec.placeholder"
              class="input font-mono !text-xs !px-2 !py-0.5 flex-1 min-w-0"
            >
          </div>
          <!-- read-only session meta (assignment/version aren't URL-settable) -->
          <div border-t="~ gray-200" pt-1 flex="~ col gap-0.5" text-xs>
            <div v-for="[k, v] in metaRows" :key="k" flex="~ gap-2 items-start">
              <span text-gray-600 w="115px" shrink-0 break-words>{{ k }}</span>
              <span font-mono break-all min-w-0>{{ v }}</span>
            </div>
          </div>
        </div>
      </details>
    </div>

    <!-- resolved condition (collapsed by default) -->
    <details v-if="conditionRows.length" border-t="~ gray-200" pt-1>
      <summary text-gray-500 text-xs cursor-pointer select-none>resolved condition (experiment.condition)</summary>
      <!-- key column sizes to the longest key, values get all remaining width -->
      <div
        grid gap-x-3 gap-y-0.5 max-h="200px" overflow-y-auto class="subtle-scrollbar" text-xs mt-1
        style="grid-template-columns: minmax(0, max-content) minmax(0, 1fr)"
      >
        <template v-for="row in conditionRows" :key="row.key">
          <span text-gray-600 break-words>{{ row.key }}</span>
          <span v-if="row.scalar" font-mono break-all min-w-0 text-ink>{{ String(row.raw) }}</span>
          <span v-else><CondValue :value="row.raw" :label="row.key" /></span>
        </template>
      </div>
    </details>
    <div v-else border-t="~ gray-200" pt-1 text-gray-400 text-xs italic>Run an experiment page to populate experiment.condition.</div>
  </div>
</template>
