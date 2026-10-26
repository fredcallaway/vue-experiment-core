<script lang="ts" setup>
import { useErrorLogging } from '../composables/logEvent'
import { useCurrentSession } from '../composables/useCurrentSession'
import { useWindowEnforcer } from '../composables/windowEnforcer'
import { getUrlFlag } from '../utils/url-params'
import { useMounted } from '@vueuse/core'

useErrorLogging()
const { violated } = useWindowEnforcer()
const mounted = useMounted()
const route = useRoute()

// Workers traverse a separate experiment instance, with no navigation or outline of their own.
const isOutlineWorker = getUrlFlag('outlineWorker')
if (isOutlineWorker) useCurrentSession().mode = 'debug'

const preview = computed(() => {
  // Keep existing shared links working; navigation always writes the Preview flag.
  const value = route.query.preview !== undefined ? route.query.preview : route.query.noDev
  return value === null || (typeof value === 'string' && !['0', 'false', 'no'].includes(value.toLowerCase()))
})
provide('devTools', computed(() => !preview.value && !isOutlineWorker))
</script>

<template>
  <div v-if="isOutlineWorker" class="fixed inset-0 bg-gray-600 flex justify-center items-center">
    <MainContent class="bg-white border-4" fixed-width fixed-height>
      <slot v-if="mounted" />
    </MainContent>
    <OutlineWorkerDriver />
  </div>
  <div v-else class="developer-layout h-screen p2 flex flex-col overflow-auto" :class="{ 'preview-mode': preview }">
    <NavBar class="mb-2 shrink-0 relative z-50" :preview="preview" />
    <div class="experiment-workspace flex flex-row flex-gap-2 flex-1 min-h-0">
      <div class="flex flex-col flex-gap-2">
        <!-- Keep this instance mounted when switching modes so the experiment does not restart. -->
        <MainContent
          :show-outline="!preview"
          :class="{ 'bg-white border-4': preview }"
          fixed-width
          fixed-height
          capture-errors
        >
          <slot v-if="mounted" />
        </MainContent>
      </div>

      <div v-if="!preview" class="flex flex-col flex-gap-2 shrink-0 min-h-0">
        <EpochControls class="shrink-0" />
        <EpochOutline class="flex-1 min-h-0" />
      </div>
      <div v-if="!preview && !violated" class="w-600px relative flex flex-col min-h-0">
        <Inspector class="mb-2 shrink-0" />
        <ConditionView class="mb-2 shrink-0" />
        <DataEventPanels class="flex-1 min-h-0" />
      </div>
    </div>
    <PreviewOutline v-if="preview" />
    <OutlineWorkerFrame />
  </div>
</template>

<style scoped>
.developer-layout {
  position: relative;
}

.preview-mode {
  @apply bg-gray-600;
}

.preview-mode .experiment-workspace {
  position: absolute;
  inset: 0;
  justify-content: center;
  align-items: center;
}
</style>
