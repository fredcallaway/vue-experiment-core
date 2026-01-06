<script setup lang="ts">

const props = defineProps<{
  correspondence: Correspondence
  showStudyLink?: boolean
  showSessionLink?: boolean
}>()

const messageList = computed(() => props.correspondence.messages ?? [])

const emit = defineEmits<{
  send: [text: string, bonus: number]
  resolve: []
}>()

const messages = useProlificMessages()
messages.refreshCorrespondence(props.correspondence.studyId, props.correspondence.participantId)

const prolific = useProlific()
const studyCache = prolific.getStudyCache(props.correspondence.studyId)

const submission = computed(() => {
  const study = studyCache.fullItem.value
  if (!study) return null
  return study.submissions.find(s => s.participant_id === props.correspondence.participantId)
})

const totalBonus = computed(() => {
  if (!submission.value) return 0
  return sum(submission.value.bonus_payments)
})

const isLoading = ref(false)
const replyText = ref('')
const bonusAmount = ref(0)

const hasInput = computed(() => !!replyText.value.trim() || bonusAmount.value > 0)

const messagesContainer = ref<HTMLElement>()

const scrollToBottom = () => {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}

watch(messageList, () => {
  nextTick(scrollToBottom)
}, { flush: 'post' })

onMounted(scrollToBottom)

const handleSend = async () => {
  isLoading.value = true
  try {
    if (bonusAmount.value > 0) {
      await messages.assignBonus(props.correspondence.studyId, props.correspondence.participantId, bonusAmount.value)
    }
    if (replyText.value.trim()) {
      await messages.sendMessage(props.correspondence.studyId, props.correspondence.participantId, replyText.value.trim())
    }
    replyText.value = ''
    bonusAmount.value = 0
    emit('send', replyText.value, bonusAmount.value)
  } finally {
    isLoading.value = false
  }
}

const handleResolve = async () => {
  isLoading.value = true
  try {
    await messages.markResolved(props.correspondence.studyId, props.correspondence.participantId, !props.correspondence.resolved)
    emit('resolve')
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="p-3 bg-gray-300 -mx-4 -mt-4 mb-2 rounded-t-lg">
      <div class="font-bold">{{ correspondence.participantId }}</div>
      <div v-if="showStudyLink" class="text-xs text-gray-500">
        Study: <NuxtLink :to="`/prolific/${correspondence.studyId}`">{{ correspondence.studyId }}</NuxtLink>
      </div>
      <div v-if="showSessionLink" class="text-xs text-gray-500">
        Session: <NuxtLink :to="`/data/sessions/${correspondence.participantId}`">{{ correspondence.participantId }}</NuxtLink>
      </div>
      <div class="text-xs text-gray-500">
        Status: {{ submission?.status ?? 'Unknown' }}
      </div>
      <div class="text-xs text-gray-500">
        Total Bonus: ${{ (totalBonus / 100).toFixed(2) }}
      </div>
    </div>

    <!-- Messages -->
    <div ref="messagesContainer" class="px-2 flex-1 overflow-y-auto max-h-60 p-2 flex flex-col gap-2 subtle-scrollbar">
      <div
        v-for="(msg, idx) in messageList"
        :key="idx"
        :class="[
          'p-2 rounded text-sm max-w-[90%] break-words',
          msg.isResearcher ? 'bg-blue-100 self-end' : 'bg-gray-100 self-start'
        ]"
      >
        <div>{{ msg.body }}</div>
        <div class="text-xs text-gray-400 mt-1">
          {{ formatDateTime(msg.timestamp) }}
        </div>
      </div>
      <div v-if="messageList.length === 0" class="text-gray-400 text-sm text-center py-4">
        No messages yet
      </div>
    </div>

    <!-- Reply -->
    <div class="p-3 bg-gray-300 -mx-4 -mb-4 mt-2 rounded-b-lg flex flex-col gap-2">
      <textarea
        v-model="replyText"
        placeholder="Reply..."
        class="w-full text-sm input resize-none"
        rows="2"
      />
      <div class="flex items-center gap-2">
        <span class="text-sm fw-600 text-gray-700">Bonus</span>
        <NumberInput
          v-model="bonusAmount"
          :scroll-step="5"
          :min="0"
          :max="2000"
          class="w-11 text-sm input"
        />
        <button
          @click="handleSend"
          :disabled="isLoading || !hasInput"
          class="btn-blue-sm flex-1"
        >
          Send
        </button>
        <button
          @click="handleResolve"
          :disabled="isLoading"
          :class="[correspondence.resolved ? 'btn-yellow-sm' : 'btn-green-sm', 'flex-1']"
        >
          {{ correspondence.resolved ? 'Unresolve' : 'Resolve' }}
        </button>
      </div>
    </div>
  </div>
</template>

