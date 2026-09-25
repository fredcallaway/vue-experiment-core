<script lang="ts" setup>
import stringify from "json-stringify-pretty-compact";

const { entries, global } = useInspector()

const entriesArray = computed(() => {
  const result = Array.from(entries.values())
  if (global.data && Object.keys(global.data).length > 0) {
    result.unshift(global)
  }
  return result.map(entry => ({
    ...entry,
    data: R.mapValues(entry.data, toValue)
  }))
})
</script>

<template>
  <div
    class="border border-2 border-gray-300 p-2 text-sm rounded-lg min-w-300px flex flex-col relative"
    v-if="entriesArray.length > 0"
  >
    <div class="flex flex-col flex-gap-1 mb-2">
      <h2 class="shrink-0">Inspector</h2>
    </div>
    <div
      class="[scrollbar-gutter:stable] [scrollbar-width:thin] [scrollbar-color:rgba(0,0,0,0.2)_transparent] flex flex-col flex-gap-2 overflow-y-auto"
    >
      <div
        class="p-4 rounded-lg bg-gray-200 text-gray-600 [&>h3]:text-gray-700 p-2 mr-1 rounded-md relative"
        v-for="entry in entriesArray"
        :key="entry.id"
      >
        <span class="font-bold">{{ entry.label }}</span>
        <div class="relative mt-1">
          <pre class="whitespace-pre-wrap break-words text-xs">{{ stringify(entry.data, { indent: 2, maxLength: 80 }) }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>
