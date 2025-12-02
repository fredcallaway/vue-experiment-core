<script lang="ts" setup>

const props = defineProps<{
  error: any
  info?: any
  noHeader?: boolean
}>()

if (props.error) {
  console.error('<Error>', props.error, props.info)
}

const displayMsg = computed(() => R.isNullish(props.error) ? '' : props.error?.message || String(props.error))
const displayInfo = computed(() => props.info || props.error?.info || props.error?.data || props.error || '')

const hasContent = computed(() => {
  return Boolean(displayMsg.value || displayInfo.value)
})

</script>

<template>
<div v-if="hasContent">
  <div v-if="!noHeader" text-xl font-bold text-red-700>Error</div>
  <div
  bg-red-100 border border-red-700 text-red-700 px-4 py-3 mb-4
    font-mono text-xs max-h-120 overflow-y-auto overflow-x-auto class="subtle-scrollbar"
  >
    <span v-if="displayMsg" class="font-semibold">{{ displayMsg }}</span>
    <pre v-if="displayInfo">{{ displayInfo }}</pre>
  </div>
</div>
</template>