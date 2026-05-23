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
    v-if="entriesArray.length > 0"
    border="~ 2 gray-300"
    p-2
    text-sm
    rounded-lg
    min-w="300px"
    flex="~ col"
    relative
  >
    <div flex="~ col gap-1" mb-2>
      <h2 shrink-0>Inspector</h2>
    </div>
    <div class="subtle-scrollbar" flex="~ col gap-2" overflow-y-auto>
      <div v-for="entry in entriesArray" :key="entry.id" card-gray p-2 mr-1 rounded-md relative>
        <span font-bold>{{ entry.label }}</span>
        <div relative mt-1>
          <pre text-xs class="whitespace-pre-wrap break-words">{{ stringify(entry.data, { indent: 2, maxLength: 80 }) }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>
