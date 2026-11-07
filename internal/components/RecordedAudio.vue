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
const player = shallowRef<HTMLAudioElement | null>(null)
let request: AbortController | undefined

function bindPlayer(element: unknown) {
  player.value = element instanceof HTMLAudioElement ? element : null
}

function isSelected(file: SessionAudio) {
  return selected.value?.sessionId === file.sessionId && selected.value.bucket === file.bucket
    && selected.value.path === file.path
}

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
    player.value?.focus({ preventScroll: true })
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
      <ul class="divide-y divide-gray-200 max-h-150 overflow-auto [scrollbar-gutter:stable]">
        <li v-for="file in filtered" :key="`${file.sessionId}/${file.bucket}/${file.path}`"
          :data-recording-path="file.path" class="h-20 box-border py-3 flex items-center gap-4">
          <div class="min-w-0 flex-1">
            <div class="truncate" :title="file.filename">{{ file.filename }}</div>
            <div class="truncate text-sm">
              <NuxtLink :to="{ path: `/data/sessions/${file.sessionId}`, query: $route.query }">
                {{ file.sessionId }}
              </NuxtLink>
              <span v-if="file.epoch" class="text-gray-500 ml-3">{{ file.epoch }}</span>
            </div>
          </div>
          <div class="recording-controls" :aria-busy="isSelected(file) && loading">
            <audio v-if="isSelected(file) && playbackUrl && !error" :ref="bindPlayer" :src="playbackUrl"
              controls tabindex="0" class="w-full h-10" :aria-label="file.filename"
              @error="error = 'This recording could not be played by your browser.'" />
            <template v-else>
              <p v-if="isSelected(file) && error" role="alert" :title="error"
                class="truncate text-sm text-red-600 m-0">{{ error }}</p>
              <button type="button" class="btn-blue-sm shrink-0 w-22"
                :aria-label="isSelected(file) && error ? `Retry ${file.filename}` : `Play ${file.filename}`"
                :disabled="isSelected(file) && loading" @click="play(file)">
                {{ isSelected(file) && loading ? 'Loading…' : isSelected(file) && error ? 'Retry' : 'Play' }}
              </button>
            </template>
          </div>
        </li>
      </ul>
    </template>
  </section>
</template>

<style scoped>
.recording-controls {
  flex: 0 0 min(20rem, 45%);
  min-width: 0;
  height: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.5rem;
}
</style>
