<script lang="ts" setup>

// Shows a code snippet next to (or above) its live render, for demo tutorials.
//
// Authoring is write-twice but the copies are *exact*: the snippet is passed as the
// `code` string prop and the live version goes in the default slot. Because `code` is a
// plain JS string (not template markup), it can contain literal `<EPage>…</EPage>` with no
// HTML escaping and no `v-pre` — the component escapes it for display via text binding. This
// replaces the hand-escaped `<pre v-pre><code>&lt;EPage&gt;…</code></pre>` blocks in the demos.
//
// `code` is rendered verbatim, so write it already-trimmed/indented the way you want it shown.

const props = defineProps<{
  // The snippet to display. May be a multi-line template string with leading indentation; it's
  // trimmed and dedented before display. e.g. code="<EPage name='hi'>Hello<PContinue/></EPage>"
  code: string
  // Side-by-side (default) puts code and render in two columns; otherwise code sits above.
  layout?: 'row' | 'column'
}>()

// Strip blank leading/trailing lines, then remove the common leading indentation, so authors
// can indent a multi-line `code` string to match the surrounding template without it showing.
const display = computed(() => {
  const lines = props.code.replace(/^\n+|\s+$/g, '').split('\n')
  const indent = Math.min(...lines.filter(l => l.trim()).map(l => l.match(/^ */)![0].length))
  return lines.map(l => l.slice(indent)).join('\n')
})

</script>

<template>
  <div :class="layout === 'column' ? 'flex-col' : 'flex-col md:flex-row'" gap-3 items-start>
    <pre b-1 b-gray-200 rounded p3 text-sm overflow-x-auto flex-1 m0><code>{{ display }}</code></pre>
    <div v-if="$slots.default" flex-1 b-1 b-gray-200 rounded p3>
      <slot />
    </div>
  </div>
</template>
