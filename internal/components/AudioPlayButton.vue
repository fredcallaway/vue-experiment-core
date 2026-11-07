<script lang="ts">
let stopActiveRecording: (() => void) | undefined
</script>

<script setup lang="ts">
import { audioFilename, type AudioFile } from '../audio-file'
import { formatTime } from '../../utils/formatting'

const props = defineProps<{ file: AudioFile; durationMs?: number }>()
const filename = computed(() => audioFilename(props.file.path))
const active = ref(false)
const playbackUrl = ref('')
const error = ref('')
const position = ref(0)
const measuredDuration = ref<number>()
const duration = computed(() => measuredDuration.value ?? (props.durationMs ?? 0) / 1000)
const durationLabel = computed(() => duration.value > 0 ? formatTime(duration.value * 1000) : '—')
const positionLabel = computed(() => `${formatTime(position.value * 1000)} / ${durationLabel.value}`)
const player = useTemplateRef<HTMLAudioElement>('player')
const button = useTemplateRef<HTMLButtonElement>('button')
const seekBar = useTemplateRef<HTMLInputElement>('seekBar')
let request: AbortController | undefined

function stop(restoreFocus = true) {
  if (restoreFocus && seekBar.value && document.activeElement === seekBar.value) {
    button.value?.focus({ preventScroll: true })
  }
  request?.abort()
  request = undefined
  player.value?.pause()
  if (playbackUrl.value) URL.revokeObjectURL(playbackUrl.value)
  playbackUrl.value = ''
  active.value = false
  position.value = 0
  if (stopActiveRecording === stop) stopActiveRecording = undefined
}

function updatePosition() {
  const media = player.value
  if (!media || !active.value) return
  position.value = media.currentTime
  const end = Number.isFinite(media.duration) ? media.duration
    : media.seekable.length ? media.seekable.end(media.seekable.length - 1) : 0
  if (Number.isFinite(end) && end > 0) measuredDuration.value = end
}

function seek(event: Event) {
  const media = player.value
  if (!media) return
  media.currentTime = (event.currentTarget as HTMLInputElement).valueAsNumber
  position.value = media.currentTime
}

async function toggle() {
  if (active.value) return stop()
  stopActiveRecording?.()
  stopActiveRecording = stop
  const current = new AbortController()
  request = current
  error.value = ''
  active.value = true
  try {
    const params = new URLSearchParams({ bucket: props.file.bucket, path: props.file.path })
    const response = await fetch(`/api/recordings?${params}`, { signal: current.signal })
    if (!response.ok) {
      const details = await response.json().catch(() => ({}))
      throw new Error(details.message || details.statusMessage || 'Could not load the recording.')
    }
    const blob = await response.blob()
    if (current.signal.aborted) return
    playbackUrl.value = URL.createObjectURL(blob)
    await nextTick()
    if (!current.signal.aborted) await player.value?.play()
  } catch (cause) {
    if (current.signal.aborted) return
    stop()
    error.value = cause instanceof Error ? cause.message : String(cause)
  }
}

function playbackError() {
  if (!active.value) return
  stop()
  error.value = 'This recording could not be played by your browser.'
}

watch(() => [props.file.bucket, props.file.path], () => {
  stop()
  measuredDuration.value = undefined
  error.value = ''
})
onBeforeUnmount(() => stop(false))

const label = computed(() => active.value ? 'Stop' : error.value ? 'Retry' : 'Play')
</script>

<template>
  <span class="audio-control">
    <button ref="button" type="button" class="btn-blue-sm audio-button" :aria-label="`${label} ${filename}`"
      :title="error || filename" :aria-busy="active && !playbackUrl" @click="toggle">
      <span class="text-base" :class="active ? 'i-mdi-stop' : error ? 'i-mdi-refresh' : 'i-mdi-play'"
        aria-hidden="true" />
    </button>
    <input v-if="playbackUrl && duration > 0" ref="seekBar" type="range" class="audio-seek"
      :aria-label="`Seek ${filename}`" :aria-valuetext="positionLabel" :title="positionLabel"
      min="0" :max="duration" step="0.1" :value="position" @input="seek">
    <span v-else class="text-xs tabular-nums text-gray-500" :title="duration > 0 ? 'Duration' : 'Duration unavailable'">
      {{ durationLabel }}
    </span>
    <audio v-if="playbackUrl" ref="player" class="hidden" :src="playbackUrl"
      @loadedmetadata="updatePosition" @durationchange="updatePosition" @timeupdate="updatePosition"
      @ended="stop()" @error="playbackError" />
    <span v-if="error" role="alert" class="sr-only">{{ error }}</span>
  </span>
</template>

<style scoped>
.audio-control {
  display: inline-flex;
  align-items: center;
  vertical-align: top;
  gap: 0.375rem;
  width: 104px;
  max-width: 100%;
  height: 1.25rem;
  flex-shrink: 0;
}

.audio-button {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 1.25rem;
  height: 1.25rem;
  padding: 0;
}

.audio-seek {
  flex: 1;
  min-width: 0;
  margin: 0;
  accent-color: #3b82f6;
}
</style>
