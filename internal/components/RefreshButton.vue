<script setup lang="ts">

const props = defineProps<{
  refresh: () => Promise<any>
  isLoading: boolean
  timestamp: NumberLike | null
  label?: string
}>()

const formatTimestamp = (timestamp: NumberLike | null | undefined) => {
  if (!timestamp) return '(never)'
  const numTimestamp = ensureNumber(timestamp)
  if (isNaN(numTimestamp)) return '(never)'
  const date = new Date(numTimestamp)
  if (isNaN(date.getTime())) return '(never)'
  const today = new Date()
  const isToday = date.toDateString() === today.toDateString()
  if (isToday) {
    return date.toLocaleTimeString()
  }
  return date.toLocaleString()
}
</script>

<template>
  <span class="inline-flex items-center">
    <span mr-1 text-base text-gray-600 v-if="label">{{ label }} </span>
    <span text-base text-gray-600>{{ formatTimestamp(timestamp) }}</span>
    <button
      class=" text-blue-500 hover:text-blue-400 italic display-inline-block p-0 "
      ml-3
      @click="refresh"
      :disabled="isLoading"
    >
      <span text-lg inline-block mt--1 ml--1.5 class="i-mdi-refresh" :class="{ 'animate-spin': isLoading }" />
    </button>
  </span>
</template>

