<script setup lang="ts">
const messages = useProlificMessages()

const showAll = ref(false)

const sortedCorrespondences = computed(() => {
  const all = Object.values(messages.correspondences.value)
  const filtered = (showAll.value ? all : all.filter(c => !c.resolved))
  const nonEmpty = filtered.filter(c => c.messages?.length > 0)
  return R.sortBy(nonEmpty, c => -c.timestamp)
})

onMounted(() => {
  messages.refresh()
})
</script>

<template>
  <div class="w-full bg-gray-100 p4">
    <div class="flex gap-4">
      <h2>Messages ({{ sortedCorrespondences.length }})</h2>
      <Toggle h-9 v-model="showAll" label="show resolved" />
    </div>
    <RefreshButton
      :refresh="messages.refresh"
      :is-loading="messages.isLoading.value"
      :timestamp="messages.lastRefreshTimestamp.value"
      label="Last updated:"
    />

    <div v-if="sortedCorrespondences.length === 0" class="text-gray-500">
    </div>

    <div v-else class="flex gap-4 overflow-x-auto mt-2">
      <div
        mb-2
        v-for="correspondence in sortedCorrespondences"
        :key="`${correspondence.studyId}-${correspondence.participantId}`"
      >
        <ProlificMessageBox
          :correspondence="correspondence"
          show-study-link
          show-session-link
        />
      </div>
    </div>
  </div>
</template>
