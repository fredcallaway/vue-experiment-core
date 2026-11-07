<script lang="ts">
import { audioFile, declareDataView, isAudioFile, type AudioFile } from '../../composables/dataViews'
import { declareEventLogger } from '../../composables/logEvent'
import { useAudioRecorder } from '../../composables/useAudioRecorder'
import { useDataWriter } from '../../composables/useDataWriter'
import { useEpoch } from '../../composables/useEpoch'
import { useFirebaseStorage, type FileUploadResult } from '../../composables/useFirebaseStorage'
import { useLocalAsync } from '../../composables/useLocalAsync'

const [logStarted] = declareEventLogger('audioExample.started')
const [logRecorded] = declareEventLogger<{
  durationMs: number; mimeType: string; bytes: number
}>('audioExample.recorded')
const [logSaved, isSaved] = declareEventLogger<{ audio: AudioFile | null } | FileUploadResult>('audioExample.saved')
declareDataView('audioExample', session => {
  const trials = new Map<string, AudioFile>()
  for (const event of session.events.filter(isSaved)) {
    const data = event.data
    if (isAudioFile(data.audio)) trials.set(event.currentEpochId, data.audio)
    else if (data.saved === true && typeof data.path === 'string' && typeof data.bucket === 'string') {
      trials.set(event.currentEpochId, audioFile({ path: data.path, bucket: data.bucket }))
    }
  }
  return Array.from(trials.values(), audio => ({ audio }))
})
</script>

<script lang="ts" setup>
// A single-file trial: copy this component into an experiment's ESequence to use it live.
const epoch = useEpoch('audio')
const audio = useAudioRecorder()
const { uploadAudio } = useFirebaseStorage()
const { registerAsync } = useLocalAsync()
const writer = useDataWriter()
const localPreview = computed(() => !writer.initialized)
const busy = ref(false)
const message = ref('')
const saved = ref(false)
let filename = ''
let active = true
onUnmounted(() => { active = false })

async function run(action: () => Promise<void>) {
  if (busy.value) return
  busy.value = true
  message.value = ''
  try {
    await action()
  } catch (cause) {
    if (active) message.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    if (active) busy.value = false
  }
}

function start() {
  return run(async () => {
    saved.value = false
    await registerAsync(audio.start())
    logStarted({})
  })
}

function stop() {
  return run(async () => {
    const result = await registerAsync(audio.stop())
    filename = `audio-${crypto.randomUUID()}.${result.extension}`
    logRecorded({ durationMs: result.durationMs, mimeType: result.mimeType, bytes: result.blob.size })
  })
}

function save() {
  return run(async () => {
    if (!audio.recording.value) return
    // Reuse this filename and Blob on retry. Initialized sessions require an acknowledged upload in both modes.
    const file = await registerAsync(uploadAudio(filename, audio.recording.value))
    logSaved({ audio: file })
    saved.value = !!file || localPreview.value
    message.value = file ? 'Recording saved.' : 'Local preview only. No file was uploaded.'
  })
}
</script>

<template>
  <section class="p-6 flex flex-col gap-4 max-w-xl mx-auto">
    <h2 class="text-xl font-bold">Record an audio response</h2>
    <p>Allow microphone access, say a few words, then stop and listen to your recording.</p>
    <p v-if="!audio.supported.value" role="alert">Microphone recording is unavailable in this browser.</p>
    <p v-else-if="audio.status.value === 'recording'" role="status">Recording. Speak now.</p>
    <p v-else-if="audio.status.value === 'requesting'" role="status">Waiting for microphone permission…</p>
    <p v-if="audio.error.value" role="alert">{{ audio.error.value.message }}</p>
    <audio v-if="audio.playbackUrl.value" :src="audio.playbackUrl.value" controls aria-label="Your recording" />
    <p v-if="message" role="status">{{ message }}</p>
    <div class="flex flex-wrap gap-3">
      <PButton v-if="audio.status.value !== 'recording'" value="start"
        :disabled="busy || !audio.supported.value" @click="start">
        {{ audio.recording.value ? 'Record again' : 'Start recording' }}
      </PButton>
      <PButton v-else value="stop" :disabled="busy" @click="stop">Stop recording</PButton>
      <PButton v-if="audio.recording.value" value="save" :disabled="busy || saved" @click="save">
        {{ localPreview ? 'Finish local preview' : 'Save recording' }}
      </PButton>
      <PButton v-if="saved" value="continue" :disabled="busy" @click="epoch.done()">Continue</PButton>
    </div>
  </section>
</template>
