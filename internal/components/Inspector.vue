<script lang="ts" setup>
const { entries, global } = useInspector()

const entriesArray = computed(() => {
  const result = Array.from(entries.values())
  if (global.data && Object.keys(global.data).length > 0) {
    result.unshift(global)
  }
  return result
})
</script>

<template>
  <div v-if="entriesArray.length > 0" 
    bg-gray-100 p-2 text-sm rounded-lg overflow-x-auto
    class="subtle-scrollbar"
  >
    
    <h2>Inspector</h2>
    <div flex="~ row gap-2">
      <div v-for="entry in entriesArray" :key="entry.id" card-gray p-2>
        <div font-bold text-sm text-gray-600 mb-1>{{ entry.label }}</div>
        <pre text-xs>{{ entry.data }}</pre>
      </div>
    </div>
  </div>
</template>
