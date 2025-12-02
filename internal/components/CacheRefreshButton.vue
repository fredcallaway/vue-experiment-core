<script setup lang="ts">

interface Cache {
  timestamp: Ref<number | null>  // Last refresh time
  isLoading: Ref<boolean>  // Currently fetching
  refresh: () => Promise<void>  // Force refresh (ignores minRefreshInterval)
}

interface Props {
  cache: Cache
  label?: string
}

const { cache, label = 'last updated at' } = defineProps<Props>()
const { refresh, isLoading, timestamp } = cache

</script>

<template>
  <RefreshButton :refresh="refresh" :isLoading="isLoading" :timestamp="timestamp" :label="label" />
</template>

