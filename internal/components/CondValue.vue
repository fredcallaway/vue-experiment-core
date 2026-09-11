<script lang="ts" setup>
// Recursive gwern-style inspector for the resolved-condition panel: scalars render inline;
// arrays/objects render as a summary chip that opens a floating popup (teleported to <body> so no
// panel overflow can clip it), whose rows recurse — nested structures open nested popups.
const props = defineProps<{ value: unknown, label?: string }>()

const isScalarValue = (v: unknown) => v == null || ['string', 'number', 'boolean'].includes(typeof v)

const entries = computed((): [string, unknown][] =>
  Array.isArray(props.value)
    ? (props.value as unknown[]).map((v, i) => [String(i), v] as [string, unknown])
    : Object.entries((props.value ?? {}) as Record<string, unknown>),
)

const summary = computed(() =>
  Array.isArray(props.value)
    ? `[${(props.value as unknown[]).length}]`
    : `{${entries.value.length}}`,
)

const open = ref(false)
const chipEl = ref<HTMLElement | null>(null)
const popStyle = ref<Record<string, string>>({})

const toggle = () => {
  if (!open.value && chipEl.value) {
    const r = chipEl.value.getBoundingClientRect()
    popStyle.value = {
      left: `${Math.max(4, Math.min(r.left, window.innerWidth - 360))}px`,
      top: `${Math.max(4, Math.min(r.bottom + 4, window.innerHeight - 320))}px`,
    }
  }
  open.value = !open.value
}

onUnmounted(() => { open.value = false })
</script>

<template>
  <span v-if="isScalarValue(value)" font-mono break-all>{{ String(value) }}</span>
  <span v-else>
    <button
      ref="chipEl"
      type="button"
      font-mono rounded px-1 border="~ gray-300"
      :class="open ? 'bg-primary-100 text-primary-700 border-primary-300' : 'bg-gray-50 text-gray-500 hover:bg-gray-200'"
      style="font-size: 0.68rem; padding-top: 0; padding-bottom: 0"
      :title="`inspect ${label ?? (Array.isArray(value) ? 'array' : 'object')}`"
      @click.stop="toggle"
    >{{ summary }}</button>
    <Teleport to="body">
      <div
        v-if="open"
        fixed bg-white border="~ gray-300" rounded-lg p-2 text-xs
        class="shadow-xl z-[200] min-w-[220px] max-w-[360px]"
        :style="popStyle"
        @click.stop
      >
        <div flex="~ items-center justify-between gap-2" mb-1>
          <span font-mono text-gray-500 truncate>{{ label ?? '' }} {{ summary }}</span>
          <button text-gray-400 hover:text-red-500 shrink-0 @click.stop="open = false">✕</button>
        </div>
        <div flex="~ col gap-0.5" class="max-h-[260px]" overflow-y-auto pr-1>
          <div v-for="[k, v] in entries" :key="k" flex="~ gap-2 items-start">
            <span text-gray-500 shrink-0 font-mono class="max-w-[140px]" break-all>{{ k }}</span>
            <CondValue :value="v" :label="k" />
          </div>
        </div>
      </div>
    </Teleport>
  </span>
</template>
