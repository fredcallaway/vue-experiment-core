<script lang="ts">
let stopActiveRecording: (() => void) | undefined
</script>

<script setup lang="ts">
import { audioFilename, type AudioFile } from '../audio-file'

const props = defineProps<{ file: AudioFile }>()
const filename = computed(() => audioFilename(props.file.path))
const active = ref(false)
const playbackUrl = ref('')
const error = ref('')
const player = useTemplateRef<HTMLAudioElement>('player')
let request: AbortController | undefined

function stop() {
  request?.abort()
  request = undefined
  player.value?.pause()
  if (playbackUrl.value) URL.revokeObjectURL(playbackUrl.value)
  playbackUrl.value = ''
  active.value = false
  if (stopActiveRecording === stop) stopActiveRecording = undefined
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

watch(() => [props.file.bucket, props.file.path], () => { stop(); error.value = '' })
onBeforeUnmount(stop)

const label = computed(() => active.value ? 'Stop' : error.value ? 'Retry' : 'Play')
</script>

<template>
  <button type="button" class="btn-blue-sm audio-button" :aria-label="`${label} ${filename}`"
    :title="error || filename" :aria-busy="active && !playbackUrl" @click="toggle">{{ label }}</button>
  <audio v-if="playbackUrl" ref="player" class="hidden" :src="playbackUrl" @ended="stop" @error="playbackError" />
  <span v-if="error" role="alert" class="sr-only">{{ error }}</span>
</template>

<style scoped>
.audio-button {
  flex-shrink: 0;
  width: 3.5rem;
  height: 1.25rem;
  padding: 0;
  line-height: 1.25rem;
}
</style>
