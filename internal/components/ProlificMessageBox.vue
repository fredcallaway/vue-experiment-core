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

const refreshed = ref(false)
messages.refreshCorrespondence(props.correspondence.studyId, props.correspondence.participantId).then(() => {
  refreshed.value = true
})

const missingTimeout = useTimeout(1000)
const showMissing = computed(() => !refreshed.value && missingTimeout.value)
whenever(showMissing, () => {
  console.log('showMissing', showMissing.value)
  scrollToBottom()
})

const prolific = useProlific()
const studyCache = prolific.getStudyCache(props.correspondence.studyId)

const submission = computed(() => {
  const study = studyCache.fullItem.value
  if (!study) return null
  return study.submissions.find(s => s.participant_id === props.correspondence.participantId)
})

const currentBonus = computed(() => {
  if (!submission.value) return 0
  return sum(submission.value.bonus_payments)
})

const isLoading = ref(false)
const replyText = ref('')
const intendedBonus = ref(0)

watch(currentBonus, (val) => {
  if (intendedBonus.value < val) {
    intendedBonus.value = val
  }
}, { immediate: true })

const bonusChangeStatus = computed(() => {
  const diff = intendedBonus.value - currentBonus.value
  if (diff === 0) return 'no change'
  return `add ${diff}¢`
})

const hasBonus = computed(() => intendedBonus.value > currentBonus.value)
const hasInput = computed(() => !!replyText.value.trim() || hasBonus.value)

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
  const { studyId, participantId } = props.correspondence
  const success = {
    message: false,
    bonus: false,
  }
  const bonusDiff = intendedBonus.value - currentBonus.value
  try {
    if (replyText.value.trim()) {
      await messages.sendMessage(studyId, participantId, replyText.value.trim())
      success.message = true
    }
    if (bonusDiff > 0) {
      await prolific.assignBonuses(
        studyId,
        { [participantId]: intendedBonus.value },
        bonusDiff
      )
      success.bonus = true
    }
    replyText.value = ''
    emit('send', replyText.value, bonusDiff)
  } finally {
    isLoading.value = false
    let description = ''
    if (success.message) {
      description += `Message sent\n`
    } else if (replyText.value.trim()) {
      description += `❌ Failed to send message\n`
    }
    if (success.bonus) {
      description += `Bonus increased to ${intendedBonus.value}¢ (added ${bonusDiff}¢)\n`
    } else if (bonusDiff > 0) {
      description += `❌ Failed to increase bonus\n`
    }
    return description.trim()
  }
}

const handleSendAndResolve = async () => {
  const result = await handleSend()
  await handleResolve()
  return result
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
  <div class="flex flex-col h-full w-100">
    <!-- Header -->
    <div class="p-3 bg-gray-300 rounded-t-lg">
      <div class="font-bold">Participant {{ correspondence.participantId }}</div>
      <div v-if="showStudyLink" class="text-xs text-gray-500">
        Study: <NuxtLink :to="`/prolific/${correspondence.studyId}`">{{ correspondence.studyId }}</NuxtLink>
      </div>
      <div v-if="submission && showSessionLink" class="text-xs text-gray-500">
        Session: <NuxtLink :to="`/data/sessions/${submission.id}`">{{ submission.id }}</NuxtLink>
      </div>
      <div class="text-xs text-gray-500">
        Status: {{ submission?.status ?? 'Unknown' }}
      </div>
    </div>

    <!-- Messages -->
    <div ref="messagesContainer" 
      class="px-2 py-4 flex-1 overflow-y-auto max-h-60 flex flex-col gap-2 subtle-scrollbar bg-gray-200">
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
        <template v-if="showMissing || correspondence.timestamp === 0">
          loading messages...
        </template>
        <template v-else>
          no messages yet
        </template>
      </div>
      <div v-if="showMissing" class="text-red-400 text-sm text-center py-4">
        failed to load new messages!
      </div>
    </div>

    <!-- Reply -->
    <div class="p-3 bg-gray-300 rounded-b-lg flex flex-col gap-2">
      <textarea
        v-model="replyText"
        placeholder="Reply..."
        class="w-full text-sm input resize-none"
        rows="2"
      />
      <div class="flex items-center gap-2">
        <div w-13>
          <div class="text-sm fw-600 text-gray-700">Bonus</div>
          <div text-xs :class="[hasBonus ? 'text-green-600' : 'text-gray-500']">
            add {{ intendedBonus - currentBonus }}¢
          </div>
        </div>
        <NumberInput
          v-model="intendedBonus"
          :default="currentBonus"
          :min="currentBonus"
          :scroll-step="5"
          :max="2000"
          class="w-11 text-sm input mr-5 px-2 py-1 "
          :class="[hasBonus && 'border-green-600']"
        />
        <ActionButton
          name="Send"
          :action="handleSend"
          success="result"
          :disabled="isLoading || !hasInput"
          class="h9 btn-blue-sm flex-1"
        />
        <ActionButton v-if="hasInput && !correspondence.resolved"
          name="Send & Resolve"
          :action="handleSendAndResolve"
          success="result"
          :disabled="isLoading || !hasInput"
          class="h9 btn-green-sm text-sm flex-1"
        />
        <ActionButton v-else
          :name="correspondence.resolved ? 'Unresolve' : 'Resolve'"
          :action="handleResolve"
          :disabled="isLoading"
          class="h9 flex-1"
          :class="[correspondence.resolved ? 'btn-yellow-sm' : 'btn-green-sm']"
        />
      </div>
    </div>
  </div>
</template>

