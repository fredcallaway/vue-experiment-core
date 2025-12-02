<script setup lang="ts">

const props = defineProps<{
  refresh: () => Promise<any>
  isLoading: boolean
  timestamp: number | null
  label?: string
}>()

const formatTimestamp = (timestamp: number | null | undefined) => {
  if (!timestamp) return 'Never'
  const numTimestamp = typeof timestamp === 'string' ? Number(timestamp) : timestamp
  if (isNaN(numTimestamp)) return 'Never'
  const date = new Date(numTimestamp)
  if (isNaN(date.getTime())) return 'Never'
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
      class="bg-transparent! text-blue-500 hover:text-blue-400 italic display-inline-block p-0 "
      ml-3
      @click="refresh"
      btn-gray-xs
      :disabled="isLoading"
    >
      <span text-lg inline-block mt--1 ml--1.5 class="i-mdi-reload" :class="{ 'animate-[spin_1s_linear_infinite]': isLoading }" />
    </button>
  </span>
</template>

