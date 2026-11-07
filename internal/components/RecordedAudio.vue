<script lang="ts" setup>
import firebaseConfig from '~/firebase.config.json'
import type { SessionData } from '../data'
import { audioFile } from '../audio-file'
import { sessionAudio } from '../session-audio'
import { createTextFilter } from '../../utils/createTextFilter'
import AudioPlayButton from './AudioPlayButton.vue'

const props = defineProps<{ sessions: SessionData[] }>()
const bucket = 'storageBucket' in firebaseConfig ? String(firebaseConfig.storageBucket) : ''
const files = computed(() => props.sessions.flatMap(session => sessionAudio(session, bucket)))
const query = ref('')
const filtered = computed(() => {
  const filter = createTextFilter(query.value)
  return files.value.filter(file => filter([file.sessionId, file.participantId, file.filename, file.epoch].join(' ')))
})
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
          :data-recording-path="file.path" class="h-16 box-border py-2 flex items-center gap-4">
          <AudioPlayButton :file="audioFile(file)" :duration-ms="file.durationMs" />
          <div class="min-w-0 flex-1">
            <div class="truncate" :title="file.filename">{{ file.filename }}</div>
            <div class="truncate text-sm">
              <NuxtLink :to="{ path: `/data/sessions/${file.sessionId}`, query: $route.query }">
                {{ file.sessionId }}
              </NuxtLink>
              <span v-if="file.epoch" class="text-gray-500 ml-3">{{ file.epoch }}</span>
            </div>
          </div>
        </li>
      </ul>
    </template>
  </section>
</template>
