<script lang="ts" setup>
import firebaseConfig from '~/firebase.config.json'
import type { SessionData } from '../data'
import { sessionAudio, type SessionAudio } from '../session-audio'
import { createTextFilter } from '../../utils/createTextFilter'

const props = defineProps<{ sessions: SessionData[] }>()
const bucket = 'storageBucket' in firebaseConfig ? String(firebaseConfig.storageBucket) : ''
const files = computed(() => props.sessions.flatMap(session => sessionAudio(session, bucket)))
const query = ref('')
const filtered = computed(() => {
  const filter = createTextFilter(query.value)
  return files.value.filter(file => filter([file.sessionId, file.participantId, file.filename, file.epoch].join(' ')))
})
const selected = shallowRef<SessionAudio | null>(null)
const playbackUrl = ref('')
const error = ref('')
const loading = ref(false)
const player = useTemplateRef('player')
let request: AbortController | undefined

function clearPlayback() {
  player.value?.pause()
  if (playbackUrl.value) URL.revokeObjectURL(playbackUrl.value)
  playbackUrl.value = ''
}

async function play(file: SessionAudio) {
  request?.abort()
  const current = new AbortController()
  request = current
  clearPlayback()
  selected.value = file
  loading.value = true
  error.value = ''
  try {
    const params = new URLSearchParams({ bucket: file.bucket, path: file.path })
    const response = await fetch(`/api/recordings?${params}`, { signal: current.signal })
    if (!response.ok) {
      const details = await response.json().catch(() => ({}))
      throw new Error(details.message || details.statusMessage || 'Could not load the recording. Please try again.')
    }
    const blob = await response.blob()
    if (current.signal.aborted) return
    playbackUrl.value = URL.createObjectURL(blob)
    await nextTick()
    // Controls remain available when a browser requires another click for playback.
    await player.value?.play().catch(() => {})
  } catch (cause) {
    if (!current.signal.aborted) error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    if (!current.signal.aborted) loading.value = false
  }
}

onBeforeUnmount(() => { request?.abort(); clearPlayback() })
</script>

<template>
  <section aria-label="Recorded audio" class="flex flex-col gap-4">
    <p v-if="!files.length" class="text-gray-500">No recorded audio in these sessions.</p>
    <template v-else>
      <div class="flex items-center justify-between gap-4">
        <span>{{ filtered.length }} recording{{ filtered.length === 1 ? '' : 's' }}</span>
        <TextFilter v-model="query" placeholder="Filter by session, participant, or recording" />
      </div>
      <div v-if="selected" class="rounded border border-gray-200 p-4 flex flex-col gap-2">
        <strong class="break-words">{{ selected.filename }}</strong>
        <p v-if="loading" role="status">Loading recording…</p>
        <audio v-if="playbackUrl" ref="player" :src="playbackUrl" controls class="w-full max-w-xl"
          :aria-label="selected.filename" @error="error = 'This recording could not be played by your browser.'" />
        <p v-if="error" role="alert">{{ error }}</p>
        <button v-if="error" type="button" class="btn-blue-sm self-start" @click="play(selected)">Retry</button>
      </div>
      <ul class="divide-y divide-gray-200 max-h-150 overflow-auto">
        <li v-for="file in filtered" :key="`${file.sessionId}/${file.bucket}/${file.path}`"
          class="py-3 flex items-start gap-4">
          <button type="button" class="btn-blue-sm shrink-0" :aria-label="`Play ${file.filename}`"
            @click="play(file)">Play</button>
          <div class="min-w-0">
            <div class="break-words">{{ file.filename }}</div>
            <NuxtLink :to="{ path: `/data/sessions/${file.sessionId}`, query: $route.query }" class="text-sm">
              {{ file.sessionId }}
            </NuxtLink>
            <span v-if="file.epoch" class="text-sm text-gray-500 ml-3">{{ file.epoch }}</span>
          </div>
        </li>
      </ul>
    </template>
  </section>
</template>
