<script setup lang="ts">
import { createFatalErrorReport } from './internal/fatalErrorReport'

const props = defineProps<{ error: unknown }>()
const detailsOpen = ref(false)
const copyStatus = ref('')
const reportField = ref<HTMLTextAreaElement>()

// Do not use the normal layout, config, session, writer, or telemetry on this page.
const report = computed(() => {
  let deployment: string | undefined
  try {
    deployment = useRuntimeConfig().public.experimentDeployment
  } catch { /* A startup error can leave runtime configuration unavailable. */ }
  return createFatalErrorReport(props.error, {
    path: import.meta.client ? window.location.pathname : undefined,
    deployment,
  })
})

async function copyReport() {
  try {
    await navigator.clipboard.writeText(report.value)
    copyStatus.value = 'Report copied.'
  } catch {
    detailsOpen.value = true
    copyStatus.value = 'Copy is unavailable. Select and copy the report below.'
    await nextTick()
    reportField.value?.focus()
    reportField.value?.select()
  }
}
</script>

<template>
  <main class="fatal-error">
    <section aria-labelledby="fatal-error-title">
      <h1 id="fatal-error-title">This page could not load</h1>
      <p>Share the error report with the researcher or developer to help them investigate.</p>
      <button type="button" @click="copyReport">Copy report</button>
      <p class="copy-status" role="status">{{ copyStatus }}</p>
      <details :open="detailsOpen" @toggle="detailsOpen = ($event.target as HTMLDetailsElement).open">
        <summary>Technical details</summary>
        <textarea ref="reportField" :value="report" readonly aria-label="Error report" spellcheck="false" />
      </details>
    </section>
  </main>
</template>

<style scoped>
.fatal-error {
  box-sizing: border-box;
  min-height: 100vh;
  padding: clamp(24px, 8vh, 80px) 24px;
  background: #fff;
  color: #171717;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 16px;
  line-height: 1.5;
}
section { max-width: 760px; margin: 0 auto; }
h1 { margin: 0 0 12px; font-size: clamp(26px, 5vw, 36px); line-height: 1.2; }
p { margin: 0 0 24px; }
button {
  padding: 10px 18px;
  border: 1px solid #1d4ed8;
  border-radius: 4px;
  background: #1d4ed8;
  color: #fff;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
button:focus-visible, summary:focus-visible, textarea:focus-visible { outline: 3px solid #93c5fd; outline-offset: 3px; }
.copy-status { min-height: 1.5em; margin: 12px 0 24px; }
details { border-top: 1px solid #d4d4d4; padding-top: 16px; }
summary { width: fit-content; cursor: pointer; font-weight: 600; }
textarea {
  box-sizing: border-box;
  display: block;
  width: 100%;
  height: 360px;
  max-height: 55vh;
  margin-top: 16px;
  padding: 12px;
  border: 1px solid #a3a3a3;
  border-radius: 4px;
  background: #fafafa;
  color: #171717;
  font: 13px/1.5 monospace;
  resize: vertical;
}
</style>
