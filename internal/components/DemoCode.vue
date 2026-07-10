<script lang="ts" setup>

// Shows a teaching snippet next to (or above) an optional live render, for demo tutorials.
//
// The `code` prop and the default slot are DELIBERATELY DECOUPLED — they are not two copies of
// the same text. `code` is an *idealized* snippet written for clarity: minimal, ellipses welcome,
// stripped of the layout scaffolding a presentable live widget needs. The slot is a *live example*
// of the same concept. They illustrate one idea from two angles; do not try to keep them
// byte-identical (that fight is what this component exists to avoid).
//
// Because `code` is a plain JS string (not template markup), it can contain literal
// `<EPage>…</EPage>` with no HTML escaping and no `v-pre` — the component escapes it for display
// via text binding. It's rendered verbatim, so write it already trimmed/indented as you want shown.
//
// Used in the /docs page, to give a first-time human reader inline code alongside prose (and
// optionally a running widget). If this spreads widely, that's the trigger to add a build step
// that derives the displayed snippet from real source — until then, decoupled-by-hand is right.

const props = defineProps<{
  // The snippet to display. May be a multi-line template string with leading indentation; it's
  // trimmed and dedented before display. e.g. code="<EContinue name='hi'>Hello</EContinue>"
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
