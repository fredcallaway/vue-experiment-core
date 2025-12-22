<script setup lang="ts">
const messages = useProlificMessages()

const showAll = ref(false)
const loadingKeys = ref<Set<string>>(new Set())

const sortedCorrespondences = computed(() => {
  const all = Object.values(messages.correspondences.value)
  const filtered = showAll.value ? all : all.filter(c => !c.resolved)
  return R.sortBy(filtered, c => -c.timestamp)
})

const replyTexts = ref<Record<string, string>>({})
const bonusAmounts = ref<Record<string, number>>({})

const getKey = (c: { studyId: string; participantId: string }) => `${c.studyId}-${c.participantId}`

const getBonusModel = (key: string) => {
  if (!(key in bonusAmounts.value)) bonusAmounts.value[key] = 0
  return computed({
    get: () => bonusAmounts.value[key],
    set: (v) => bonusAmounts.value[key] = v
  })
}

const hasInput = (key: string) => {
  const text = replyTexts.value[key]?.trim()
  const bonus = bonusAmounts.value[key] || 0
  return !!text || bonus > 0
}

const withLoading = async (key: string, fn: () => Promise<void>) => {
  loadingKeys.value.add(key)
  try {
    await fn()
  } finally {
    loadingKeys.value.delete(key)
  }
}

const handleSend = (correspondence: { studyId: string; participantId: string }) => {
  const key = getKey(correspondence)
  withLoading(key, async () => {
    const text = replyTexts.value[key]?.trim()
    const bonus = bonusAmounts.value[key] || 0

    if (bonus > 0) {
      await messages.assignBonus(correspondence.studyId, correspondence.participantId, bonus)
    }
    
    if (text) {
      await messages.sendMessage(correspondence.studyId, correspondence.participantId, text)
    }
    
    replyTexts.value[key] = ''
    bonusAmounts.value[key] = 0
  })
}

const handleResolve = (correspondence: { studyId: string; participantId: string; resolved: boolean }) => {
  const key = getKey(correspondence)
  withLoading(key, () => messages.markResolved(correspondence.studyId, correspondence.participantId, !correspondence.resolved))
}

onMounted(() => {
  messages.refresh()
})
</script>

<template>
  <div class="w-full bg-gray-100 p4">
    <div class="flex gap-4">
      <h2>Messages ({{ sortedCorrespondences.length }})</h2>
      <Toggle h-9 v-model="showAll" label="show resolved" />
      <!-- <span class="text-gray-500">{{ sortedCorrespondences.length }} correspondence(s)</span> -->
    </div>
    <RefreshButton
      :refresh="messages.refresh"
      :is-loading="messages.isLoading.value"
      :timestamp="messages.lastRefreshTimestamp.value"
      label="Last updated:"
    />

    <div v-if="sortedCorrespondences.length === 0" class="text-gray-500">
      <!-- No {{ showAll ? '' : 'unresolved ' }}messages -->
    </div>

    <div v-else class="flex gap-4 overflow-x-auto mt-2">
      <div
        v-for="correspondence in sortedCorrespondences"
        :key="getKey(correspondence)"
        class="flex-shrink-0 w-80 card-gray flex flex-col"
      >
        <!-- Header -->
        <div class="p-3 bg-gray-300 -mx-4 -mt-4 mb-2 rounded-t-lg">
          <div class="font-bold">{{ correspondence.participantId }}</div>
          <div class="text-xs text-gray-500">
            Study: <NuxtLink :to="`/prolific/${correspondence.studyId}`">{{ correspondence.studyId }}</NuxtLink>
          </div>
          <div class="text-xs text-gray-500">
            Session: <NuxtLink :to="`/data/sessions/${correspondence.participantId}`">{{ correspondence.participantId }}</NuxtLink>
          </div>
          <div class="text-xs text-gray-500">
            {{ formatDateTime(correspondence.timestamp) }}
          </div>
        </div>

        <!-- Messages -->
        <div class="px-2 flex-1 overflow-y-auto max-h-60 p-2 flex flex-col gap-2 subtle-scrollbar">
          <div
            v-for="(msg, idx) in correspondence.messages"
            :key="idx"
            :class="[
              'p-2 rounded text-sm max-w-[90%]',
              msg.isResearcher ? 'bg-blue-100 self-end' : 'bg-gray-100 self-start'
            ]"
          >
            <div>{{ msg.body }}</div>
            <div class="text-xs text-gray-400 mt-1">
              {{ formatDateTime(msg.timestamp) }}
            </div>
          </div>
        </div>

        <!-- Reply -->
        <div class="p-3 bg-gray-300 -mx-4 -mb-4 mt-2 rounded-b-lg flex flex-col gap-2">
          <textarea
            v-model="replyTexts[getKey(correspondence)]"
            placeholder="Reply..."
            class="w-full text-sm input resize-none"
            rows="2"
          />
          <div class="flex items-center gap-2">
            <span class="text-sm fw-600 text-gray-700">Bonus</span>
            <NumberInput
              v-model="getBonusModel(getKey(correspondence)).value"
              :scroll-step="5"
              :min="0"
              :max="2000"
              class="w-11 text-sm input"
            />
            <button
              @click="handleSend(correspondence)"
              :disabled="loadingKeys.has(getKey(correspondence)) || !hasInput(getKey(correspondence))"
              class="btn-blue-sm flex-1"
            >
              Send
            </button>
            <button
              @click="handleResolve(correspondence)"
              :disabled="loadingKeys.has(getKey(correspondence))"
              :class="[correspondence.resolved ? 'btn-yellow-sm' : 'btn-green-sm', 'flex-1']"
            >
              {{ correspondence.resolved ? 'Unresolve' : 'Resolve' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
